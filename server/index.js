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
  const bundled = ytdlpDefault.binaryPath || ytdlpDefault.ytdlp?.binaryPath;
  if (bundled && fs.existsSync(bundled)) {
    return { run: ytdlpDefault, source: `bundled (${bundled})` };
  }
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
    format: z.enum(["mp4", "mp3"]).default("mp4"),
    quality: z.string().default("best"),
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

// Minimal WebVTT parser -> [{ start: seconds, end: seconds, text }]
function parseVtt(raw) {
  const lines = [];
  const blocks = raw.replace(/\r/g, "").split("\n\n");
  const tc =
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (h, m, s) => h * 3600 + m * 60 + s;
  for (const block of blocks) {
    const rows = block.split("\n");
    const timing = rows.find((r) => tc.test(r));
    if (!timing) continue;
    const m = timing.match(tc);
    const start = toSec(+m[1], +m[2], +m[3]);
    const end = toSec(+m[5], +m[6], +m[7]);
    const text = rows
      .filter(
        (r) => !tc.test(r) && r.trim() && !/^\d+$/.test(r) && r !== "WEBVTT",
      )
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) lines.push({ start, end, text });
  }
  // De-dupe consecutive identical lines (auto-captions repeat rolling text).
  return lines.filter((l, i) => i === 0 || l.text !== lines[i - 1].text);
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
    res.status(400).json({
      error: (e?.stderr || e?.message || "yt-dlp failed").toString().trim(),
    });
  }
});

app.post("/api/transcript", async (req, res) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yttxt-"));
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    // English is usually an AUTO caption on YouTube (see `yt-dlp --list-subs`),
    // so writeAutoSubs matters. writeSubs also covers videos with real subs.
    await yt.run(parsed.data.url, {
      skipDownload: true,
      writeAutoSubs: true,
      writeSubs: true,
      subLangs: "en", // exact match; "en.*" can miss depending on version
      subFormat: "vtt",
      noPlaylist: true,
      noWarnings: true,
      output: path.join(tempDir, "sub"),
      ffmpegLocation: ffmpegPath,
    });

    const files = fs.readdirSync(tempDir);
    console.log("[server] transcript files:", files); // diagnostic while stabilising

    // Prefer a real "en" track, else any .vtt that landed.
    const vtt =
      files.find((f) => /\.en\.vtt$/.test(f)) ||
      files.find((f) => f.endsWith(".vtt"));

    if (!vtt) {
      cleanup();
      return res.json({ lines: [], available: false });
    }

    const raw = fs.readFileSync(path.join(tempDir, vtt), "utf8");
    cleanup();

    const lines = parseVtt(raw);
    res.json({ lines, available: lines.length > 0 });
  } catch (e) {
    console.error(
      "[server] transcript error:",
      (e?.stderr || e?.message || "").toString().trim(),
    ); // diagnostic
    cleanup();
    // No captions is a normal outcome, not a hard error.
    res.json({
      lines: [],
      available: false,
      note: (e?.stderr || e?.message || "").toString().trim(),
    });
  }
});

app.post("/api/download", async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, start, end, format, quality } = parsed.data;

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
    return res.status(400).json({
      error: (e?.stderr || e?.message || "yt-dlp probe failed")
        .toString()
        .trim(),
    });
  }

  const isAudio = format === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, `clip.${ext}`);
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  // Map the UI quality to a yt-dlp video format string.
  const videoFormat =
    quality === "best"
      ? "bv*+ba/b"
      : `bv*[height<=${quality}]+ba/b[height<=${quality}]`;

  const options = isAudio
    ? {
        downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
        forceKeyframesAtCuts: true,
        noPlaylist: true,
        noWarnings: true,
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: quality, // kbps, e.g. "192"
        output: outputPath,
        ffmpegLocation: ffmpegPath,
      }
    : {
        downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
        forceKeyframesAtCuts: true,
        noPlaylist: true,
        noWarnings: true,
        format: videoFormat,
        mergeOutputFormat: "mp4",
        output: outputPath,
        ffmpegLocation: ffmpegPath,
      };

  try {
    await yt.run(url, options);

    if (!fs.existsSync(outputPath)) {
      cleanup();
      return res.status(500).json({ error: "yt-dlp produced no output" });
    }

    const stat = fs.statSync(outputPath);
    const name = `clip-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on("close", cleanup);
    stream.on("error", cleanup);
  } catch (e) {
    cleanup();
    res.status(500).json({
      error: (e?.stderr || e?.message || "Download failed").toString().trim(),
    });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
