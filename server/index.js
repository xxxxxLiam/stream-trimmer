/**
 * File: index.js
 * Path: server/index.js
 * Description: Runs the local yt-dlp and ffmpeg clip-download backend.
 */
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import express from "express";
import { z } from "zod";

const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;
const BINARY_CHECK_ARGS = ["--version"];
const RANDOM_FILENAME_BYTES = 4;

const youtubeUrlSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => /youtube\.com|youtu\.be/.test(value), "URL must be a YouTube link"),
});

const downloadSchema = z
  .object({
    url: z.string().url(),
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })
  .refine((value) => value.end > value.start, { message: "End must be greater than start" })
  .refine((value) => value.end - value.start <= MAX_CLIP_SECONDS, {
    message: `Clip length capped at ${MAX_CLIP_SECONDS} seconds (10 minutes)`,
  });

function writeLine(message) {
  process.stdout.write(`${message}\n`);
}

function writeError(message) {
  process.stderr.write(`${message}\n`);
}

function hasBinary(name) {
  const probe = spawnSync(name, BINARY_CHECK_ARGS, { stdio: "ignore" });
  return probe.status === 0;
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort for temporary files.
  }
}

const hasYtDlp = hasBinary("yt-dlp");
const hasFfmpeg = hasBinary("ffmpeg");

if (!hasYtDlp) {
  writeError("[startup] MISSING: yt-dlp is not on PATH. Install it from https://github.com/yt-dlp/yt-dlp#installation");
}

if (!hasFfmpeg) {
  writeError("[startup] MISSING: ffmpeg is not on PATH. Install it from https://ffmpeg.org/download.html");
}

if (hasYtDlp && hasFfmpeg) {
  writeLine("[startup] yt-dlp and ffmpeg detected on PATH");
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/info", (request, response) => {
  const parsed = youtubeUrlSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (!hasYtDlp) {
    return response.status(500).json({
      error: "yt-dlp is not installed or is not available on PATH. Install yt-dlp locally, then restart npm run dev.",
    });
  }

  const child = spawn("yt-dlp", ["--dump-json", "--no-warnings", parsed.data.url]);
  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      return response.status(400).json({ error: errorOutput.trim() || "yt-dlp failed to read video info" });
    }

    try {
      const info = JSON.parse(output);
      return response.json({
        title: info.title,
        duration: info.duration,
        id: info.id,
        thumbnail: info.thumbnail,
      });
    } catch {
      return response.status(500).json({ error: "Failed to parse yt-dlp output" });
    }
  });
});

app.post("/api/download", (request, response) => {
  const parsed = downloadSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (!hasYtDlp || !hasFfmpeg) {
    return response.status(500).json({
      error: "yt-dlp and ffmpeg must both be installed and available on PATH. Install them locally, then restart npm run dev.",
    });
  }

  const { url, start, end } = parsed.data;
  const durationProbe = spawnSync("yt-dlp", ["--print", "%(duration)s", "--no-warnings", url], { encoding: "utf8" });
  const duration = Number.parseFloat((durationProbe.stdout || "").trim());

  if (Number.isFinite(duration) && end > duration + 1) {
    return response.status(400).json({ error: "End exceeds video duration" });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, "clip.mp4");
  const section = `*${start.toFixed(2)}-${end.toFixed(2)}`;
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--download-sections",
    section,
    "--force-keyframes-at-cuts",
    "-f",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    url,
  ];
  const child = spawn("yt-dlp", args);
  let errorOutput = "";

  child.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  child.on("close", (code) => {
    if (code !== 0 || !fs.existsSync(outputPath)) {
      cleanup(tempDir);
      return response.status(500).json({ error: errorOutput.trim() || "yt-dlp failed" });
    }

    const stat = fs.statSync(outputPath);
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Length", stat.size);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="clip-${crypto.randomBytes(RANDOM_FILENAME_BYTES).toString("hex")}.mp4"`,
    );
    const stream = fs.createReadStream(outputPath);
    stream.pipe(response);
    stream.on("close", () => cleanup(tempDir));
  });
});

app.listen(PORT, () => {
  writeLine(`[server] listening on http://localhost:${PORT}`);
});