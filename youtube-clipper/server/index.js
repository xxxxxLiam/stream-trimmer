// Local Express backend: shells out to yt-dlp + ffmpeg to download only the
// selected section of a YouTube video and streams back a trimmed clip.mp4.
import express from "express";
import cors from "cors";
import { spawn, spawnSync } from "node:child_process";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const PORT = process.env.PORT || 5174;
const MAX_CLIP_SECONDS = 600; // 10 minute cap

// ---------- Binary availability check ----------
function checkBinary(name) {
  const probe = spawnSync(name, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}
const hasYtDlp = checkBinary("yt-dlp");
const hasFfmpeg = checkBinary("ffmpeg");
if (!hasYtDlp) console.error("[startup] MISSING: yt-dlp is not on PATH. Install it: https://github.com/yt-dlp/yt-dlp#installation");
if (!hasFfmpeg) console.error("[startup] MISSING: ffmpeg is not on PATH. Install it: https://ffmpeg.org/download.html");
if (hasYtDlp && hasFfmpeg) console.log("[startup] yt-dlp and ffmpeg detected on PATH ✓");

// ---------- Validation schemas ----------
const urlSchema = z.object({
  url: z.string().url().refine(
    (u) => /youtube\.com|youtu\.be/.test(u),
    "URL must be a YouTube link"
  ),
});

const downloadSchema = z
  .object({
    url: z.string().url(),
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .refine((d) => d.end > d.start, { message: "end must be greater than start" })
  .refine((d) => d.end - d.start <= MAX_CLIP_SECONDS, {
    message: `Clip length capped at ${MAX_CLIP_SECONDS} seconds (10 minutes)`,
  });

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/info", async (req, res) => {
  const parsed = urlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!hasYtDlp) return res.status(500).json({ error: "yt-dlp is not installed on the server" });

  const { url } = parsed.data;
  const proc = spawn("yt-dlp", ["--dump-json", "--no-warnings", url]);
  let out = "";
  let err = "";
  proc.stdout.on("data", (c) => (out += c));
  proc.stderr.on("data", (c) => (err += c));
  proc.on("close", (code) => {
    if (code !== 0) {
      return res.status(400).json({ error: err.trim() || "yt-dlp failed to read video info" });
    }
    try {
      const info = JSON.parse(out);
      res.json({
        title: info.title,
        duration: info.duration, // seconds
        id: info.id,
        thumbnail: info.thumbnail,
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to parse yt-dlp output" });
    }
  });
});

app.post("/api/download", async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!hasYtDlp || !hasFfmpeg) {
    return res.status(500).json({ error: "yt-dlp or ffmpeg is not installed on the server" });
  }

  const { url, start, end } = parsed.data;

  // Cross-check duration server-side
  try {
    const probe = spawnSync("yt-dlp", ["--print", "%(duration)s", "--no-warnings", url], {
      encoding: "utf8",
    });
    const dur = parseFloat((probe.stdout || "").trim());
    if (Number.isFinite(dur) && end > dur + 1) {
      return res.status(400).json({ error: "end exceeds video duration" });
    }
  } catch {
    /* non-fatal; yt-dlp step below will error if URL is bad */
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outPath = path.join(tmpDir, "clip.mp4");
  const section = `*${start.toFixed(2)}-${end.toFixed(2)}`;

  // yt-dlp --download-sections streams ONLY the requested window (plus small
  // keyframe overhead). --force-keyframes-at-cuts + ffmpeg stream-copy give
  // near-instant, lossless trimming when the container allows it.
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--download-sections", section,
    "--force-keyframes-at-cuts",
    "-f", "bv*+ba/b",
    "--merge-output-format", "mp4",
    "-o", outPath,
    url,
  ];

  const proc = spawn("yt-dlp", args);
  let errBuf = "";
  proc.stderr.on("data", (c) => (errBuf += c.toString()));
  proc.stdout.on("data", (c) => process.stdout.write(c));

  proc.on("close", (code) => {
    if (code !== 0 || !fs.existsSync(outPath)) {
      cleanup(tmpDir);
      return res.status(500).json({ error: errBuf.trim() || "yt-dlp failed" });
    }
    const stat = fs.statSync(outPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="clip-${crypto.randomBytes(4).toString("hex")}.mp4"`);
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on("close", () => cleanup(tmpDir));
  });
});

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});