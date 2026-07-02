import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import ytdlp from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;

const urlSchema = z
  .string()
  .url()
  .refine((v) => /youtube\.com|youtu\.be/.test(v), "URL must be a YouTube link");

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

// Preflight: ensure bundled binaries resolved.
function preflight() {
  const problems = [];
  try {
    const ytBin = ytdlp.binaryPath || ytdlp.ytdlp?.binaryPath;
    if (!ytBin || !fs.existsSync(ytBin)) problems.push("yt-dlp");
  } catch {
    problems.push("yt-dlp");
  }
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) problems.push("ffmpeg");

  if (problems.length === 0) {
    console.log(`[server] bundled binaries ready (ffmpeg: ${ffmpegPath})`);
    return true;
  }

  console.error(`[server] Missing bundled binaries: ${problems.join(", ")}`);
  const platform = process.platform;
  const hint =
    platform === "darwin"
      ? "Run `npm install` again. On Apple Silicon you may need Rosetta: `softwareupdate --install-rosetta`."
      : platform === "win32"
        ? "Run `npm install` again in an elevated shell. Ensure your antivirus is not quarantining yt-dlp.exe."
        : "Run `npm install` again. Ensure your Node version is 18+ and that /tmp is executable.";
  console.error(`[server] ${hint}`);
  return false;
}

const binariesOk = preflight();

const app = express();
app.use(cors());
app.use(express.json());

function binaryError(res) {
  return res.status(500).json({
    error:
      "Bundled yt-dlp or ffmpeg not available. Re-run `npm install`, then restart `npm run dev`.",
  });
}

app.post("/api/info", async (req, res) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  try {
    const info = await ytdlp(parsed.data.url, {
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
    res.status(400).json({ error: (e?.stderr || e?.message || "yt-dlp failed").toString().trim() });
  }
});

app.post("/api/download", async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, start, end } = parsed.data;

  // Re-probe duration server-side.
  try {
    const info = await ytdlp(url, { dumpSingleJson: true, noWarnings: true, noPlaylist: true });
    if (typeof info.duration === "number" && end > info.duration + 1) {
      return res.status(400).json({ error: "End exceeds video duration" });
    }
  } catch (e) {
    return res.status(400).json({ error: (e?.stderr || e?.message || "yt-dlp probe failed").toString().trim() });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, "clip.mp4");
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    await ytdlp(url, {
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
    res.status(500).json({ error: (e?.stderr || e?.message || "Download failed").toString().trim() });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});