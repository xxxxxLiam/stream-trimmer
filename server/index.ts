/**
 * File: index.ts
 * Path: server/index.ts
 * Description: Local Express backend — /api/info, /api/download, /api/transcript.
 * Uses bundled yt-dlp (with PATH fallback) and ffmpeg-static. Runs via `tsx`.
 */
import express, { type Request, type Response } from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { z } from "zod";
// youtube-dl-exec ships its own types but they're partial — treat as any for the
// options object shape while keeping our request/response types precise.
import ytdlpModule, { create } from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;

type YtRunner = (url: string, opts: Record<string, unknown>) => Promise<any>;

interface YtResolved {
  run: YtRunner;
  source: string;
}

// Resolve yt-dlp: prefer the bundled binary, fall back to one on the system PATH.
function resolveYtDlp(): YtResolved | null {
  const anyMod = ytdlpModule as unknown as {
    binaryPath?: string;
    ytdlp?: { binaryPath?: string };
  };
  const bundled = anyMod.binaryPath || anyMod.ytdlp?.binaryPath;
  if (bundled && fs.existsSync(bundled)) {
    return {
      run: ytdlpModule as unknown as YtRunner,
      source: `bundled (${bundled})`,
    };
  }
  try {
    const lookup =
      process.platform === "win32" ? "where yt-dlp" : "command -v yt-dlp";
    const sysPath = execSync(lookup).toString().trim().split("\n")[0];
    if (sysPath && fs.existsSync(sysPath)) {
      return {
        run: create(sysPath) as unknown as YtRunner,
        source: `system (${sysPath})`,
      };
    }
  } catch {
    // not on PATH
  }
  return null;
}

const yt = resolveYtDlp();
const ffmpegOk = Boolean(ffmpegPath && fs.existsSync(ffmpegPath));

function preflight(): boolean {
  const problems: string[] = [];
  if (!yt) problems.push("yt-dlp");
  if (!ffmpegOk) problems.push("ffmpeg");

  if (problems.length === 0) {
    console.log(`[server] yt-dlp ready: ${yt!.source}`);
    console.log(`[server] ffmpeg ready: ${ffmpegPath}`);
    return true;
  }

  console.error(`[server] Missing binaries: ${problems.join(", ")}`);
  const platform = process.platform;
  const hints: Record<string, Record<string, string>> = {
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

type DownloadInput = z.infer<typeof downloadSchema>;

const app = express();
app.use(cors());
app.use(express.json());

function binaryError(res: Response) {
  return res.status(500).json({
    error:
      "yt-dlp or ffmpeg not available. Check the server console for the install command, then run `npm run setup`.",
  });
}

interface VttLine {
  start: number;
  end: number;
  text: string;
}

function parseVtt(raw: string): VttLine[] {
  const lines: VttLine[] = [];
  const blocks = raw.replace(/\r/g, "").split("\n\n");
  const tc =
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;
  for (const block of blocks) {
    const rows = block.split("\n");
    const timing = rows.find((r) => tc.test(r));
    if (!timing) continue;
    const m = timing.match(tc)!;
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
  return lines.filter((l, i) => i === 0 || l.text !== lines[i - 1].text);
}

function errMessage(e: unknown): string {
  const anyE = e as { stderr?: string; message?: string } | null;
  return (anyE?.stderr || anyE?.message || "").toString().trim();
}

app.post("/api/info", async (req: Request, res: Response) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  try {
    const info = await yt!.run(parsed.data.url, {
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
    res.status(400).json({ error: errMessage(e) || "yt-dlp failed" });
  }
});

app.post("/api/transcript", async (req: Request, res: Response) => {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yttxt-"));
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    await yt!.run(parsed.data.url, {
      skipDownload: true,
      writeAutoSubs: true,
      writeSubs: true,
      subLangs: "en",
      subFormat: "vtt",
      noPlaylist: true,
      noWarnings: true,
      output: path.join(tempDir, "sub"),
      ffmpegLocation: ffmpegPath,
    });

    const files = fs.readdirSync(tempDir);
    console.log("[server] transcript files:", files);

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
    console.error("[server] transcript error:", errMessage(e));
    cleanup();
    res.json({ lines: [], available: false, note: errMessage(e) });
  }
});

app.post("/api/download", async (req: Request, res: Response) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!binariesOk) return binaryError(res);

  const { url, start, end, format, quality }: DownloadInput = parsed.data;

  // Re-probe duration so the cap can't be bypassed by a crafted request.
  try {
    const info = await yt!.run(url, {
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
      .json({ error: errMessage(e) || "yt-dlp probe failed" });
  }

  const isAudio = format === "mp3";
  const ext = isAudio ? "mp3" : "mp4";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-"));
  const outputPath = path.join(tempDir, `clip.${ext}`);
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  const videoFormat =
    quality === "best"
      ? "bv*+ba/b"
      : `bv*[height<=${quality}]+ba/b[height<=${quality}]`;

  const options: Record<string, unknown> = isAudio
    ? {
        downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
        forceKeyframesAtCuts: true,
        noPlaylist: true,
        noWarnings: true,
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: quality,
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
    await yt!.run(url, options);

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
    res.status(500).json({ error: errMessage(e) || "Download failed" });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});