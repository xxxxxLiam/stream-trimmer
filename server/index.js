import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { z } from "zod";
import { create } from "youtube-dl-exec";
import ytdlpDefault from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;

// Resolve yt-dlp: prefer the bundled binary, fall back to one on the system PATH.
function resolveYtDlp() {
  // 1. Bundled binary from youtube-dl-exec, if it actually downloaded.
  const bundled = ytdlpDefault.binaryPath || ytdlpDefault.ytdlp?.binaryPath;
  if (bundled && fs.existsSync(bundled)) {
    return { run: ytdlpDefault, source: `bundled (${bundled})` };
  }
  // 2. System yt-dlp on PATH.
  try {
    const lookup =
      process.platform === "win32" ? "where yt-dlp" : "command -v yt-dlp";
    const sysPath = execSync(lookup).toString().trim().split("\n")[0];
    if (sysPath && fs.existsSync(sysPath)) {
      return { run: create(sysPath), source: `system (${sysPath})` };
    }
  } catch {
    // not on PATH
  }
  return null;
}

const yt = resolveYtDlp();
const ffmpegOk = Boolean(ffmpegPath && fs.existsSync(ffmpegPath));

// Preflight: report what we found and how to fix gaps, without crashing.
function preflight() {
  const problems = [];
  if (!yt) problems.push("yt-dlp");
  if (!ffmpegOk) problems.push("ffmpeg");

  if (problems.length === 0) {
    console.log(`[server] yt-dlp ready: ${yt.source}`);
    console.log(`[server] ffmpeg ready: ${ffmpegPath}`);
    return true;
  }

  console.error(`[server] Missing binaries: ${problems.join(", ")}`);
  const platform = process.platform;
  const hints = {
    "yt-dlp": {
      darwin: "brew install yt-dlp",
      win32: "winget install yt-dlp.yt-dlp   (or: scoop install yt-dlp)",
      linux: "sudo apt install yt-dlp   (or: pipx install yt-dlp)",
    },
    ffmpeg: {
      darwin: "brew install ffmpeg",
      win32: "winget install Gyan.FFmpeg",
      linux: "sudo apt install ffmpeg",
    },
  };
  for (const p of problems) {
    const hint = hints[p]?.[platform] ?? `see the ${p} install docs`;
    console.error(`[server]   ${p}: ${hint}`);
  }
  console.error(
    "[server] Install the tool(s) above, then run `npm run setup` to re-check.",
  );
  return false;
}

const binariesOk = preflight();

const urlSchema = z
  .string()
  .url()
  .refine(
    (v) => /youtube\.com|youtu\.be/.test(v),
    "URL must be a YouTube link",
  );

const infoSchema = z.object({ url: urlSchema });

const downloadSchema = z
  .object({
    url: urlSchema,
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .refine((v) => v.end > v.start, { message: "End must be greater than start" })
  .refine((v) => v.end - v.start <= MAX_CLIP_SECONDS, {
    message: `Clip length capped at ${MAX_CLIP_SECONDS} seconds (10 minutes)`,
  });

const app = express();
app.use(cors());
app.use(express.json());

function binaryError(res) {
  return res.status(500).json({
    error:
      "yt-dlp or ffmpeg not available. Check the server console for the install command, then run `npm run setup`.",
  });
}

app.post("/api/info", async (req, res) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  try {
    const info = await yt.run(parsed.data.url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
    });
    res.json({
      id: info.id,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
    });
  } catch (e) {
    res
      .status(400)
      .json({
        error: (e?.stderr || e?.message || "yt-dlp failed").toString().trim(),
      });
  }
});

app.post("/api/download", async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, start, end } = parsed.data;

  // Re-probe duration server-side so the cap can't be bypassed by a crafted request.
  try {
    const info = await yt.run(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
    });
    if (typeof info.duration === "number" && end > info.duration + 1) {
      return res.status(400).json({ error: "End exceeds video duration" });
    }
  } catch (e) {
    return res
      .status(400)
      .json({
        error: (e?.stderr || e?.message || "yt-dlp probe failed")
          .toString()
          .trim(),
      });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, "clip.mp4");
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    await yt.run(url, {
      downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
      forceKeyframesAtCuts: true,
      noPlaylist: true,
      noWarnings: true,
      format: "bv*+ba/b",
      mergeOutputFormat: "mp4",
      output: outputPath,
      ffmpegLocation: ffmpegPath,
    });

    if (!fs.existsSync(outputPath)) {
      cleanup();
      return res.status(500).json({ error: "yt-dlp produced no output" });
    }

    const stat = fs.statSync(outputPath);
    const name = `clip-${crypto.randomBytes(4).toString("hex")}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on("close", cleanup);
    stream.on("error", cleanup);
  } catch (e) {
    cleanup();
    res
      .status(500)
      .json({
        error: (e?.stderr || e?.message || "Download failed").toString().trim(),
      });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
