/**
 * File: index.ts
 * Path: server/index.ts
 * Description: Local Express backend — /api/info, /api/download, /api/transcript.
 * Uses bundled yt-dlp (with PATH fallback) and ffmpeg-static. Runs via `tsx`.
 */
import express, { type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { z } from "zod";
// youtube-dl-exec ships its own types but they're partial — treat as any for the
// options object shape while keeping our request/response types precise.
import ytdlpModule, { create } from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

const PORT = Number(process.env.PORT || 5174);
const MAX_CLIP_SECONDS = 600;

// When running inside a packaged Electron app, binaries live under
// `<resources>/bin/`. Prefer those over the dev-time bundled/PATH locations.
function packagedBinary(name: string): string | null {
  const base = process.env.ELECTRON_RESOURCES;
  if (!base) return null;
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidate = path.join(base, "bin", exe);
  return fs.existsSync(candidate) ? candidate : null;
}

// Defense in depth: also prepend resources/bin to PATH here so yt-dlp's
// [jsc:deno] step can locate the bundled `deno` runtime.
if (process.env.ELECTRON_RESOURCES) {
  const binDir = path.join(process.env.ELECTRON_RESOURCES, "bin");
  const sep = process.platform === "win32" ? ";" : ":";
  const cur = process.env.PATH || "";
  if (!cur.split(sep).includes(binDir)) {
    process.env.PATH = `${binDir}${sep}${cur}`;
  }
}

// Resolve the bundled bin directory once. Packaged: <resources>/bin.
// Dev: repo `resources/bin`. Used to build an authoritative child env so
// spawned yt-dlp reliably sees `deno` for the [jsc:deno] step.
function resolveBinDir(): string | null {
  const fromMain = process.env.ELECTRON_RESOURCES_BIN;
  if (fromMain && fs.existsSync(fromMain)) return fromMain;
  if (process.env.ELECTRON_RESOURCES) {
    const p = path.join(process.env.ELECTRON_RESOURCES, "bin");
    if (fs.existsSync(p)) return p;
  }
  const devPath = path.resolve(process.cwd(), "resources", "bin");
  if (fs.existsSync(devPath)) return devPath;
  return null;
}

const BIN_DIR = resolveBinDir();

function childEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  if (BIN_DIR) {
    const sep = path.delimiter;
    const cur = base.PATH || "";
    const parts = cur.split(sep);
    if (!parts.includes(BIN_DIR)) {
      base.PATH = `${BIN_DIR}${sep}${cur}`;
    }
  }
  return base;
}

// Log the effective PATH prefix once so packaged-app runs are verifiable.
{
  const exe = (n: string) => (process.platform === "win32" ? `${n}.exe` : n);
  const check = (n: string) =>
    BIN_DIR && fs.existsSync(path.join(BIN_DIR, exe(n))) ? "ok" : "MISSING";
  console.log(
    `[server] binDir=${BIN_DIR ?? "(none)"} (yt-dlp=${check("yt-dlp")}, ffmpeg=${check("ffmpeg")}, deno=${check("deno")})`,
  );
  console.log(`[server] child PATH prefix=${BIN_DIR ?? "(unchanged)"}`);
}

type YtRunner = (url: string, opts: Record<string, unknown>) => Promise<any>;
type YtExec = (url: string, opts: Record<string, unknown>) => ChildProcess;

interface YtResolved {
  run: YtRunner;
  exec: YtExec;
  source: string;
}

// Resolve yt-dlp: prefer the bundled binary, fall back to one on the system PATH.
function resolveYtDlp(): YtResolved | null {
  const packaged = packagedBinary("yt-dlp");
  if (packaged) {
    const inst = create(packaged) as unknown as YtRunner & { exec: YtExec };
    return {
      run: inst,
      exec: inst.exec.bind(inst),
      source: `packaged (${packaged})`,
    };
  }
  const anyMod = ytdlpModule as unknown as {
    binaryPath?: string;
    ytdlp?: { binaryPath?: string };
    exec?: YtExec;
  };
  const bundled = anyMod.binaryPath || anyMod.ytdlp?.binaryPath;
  if (bundled && fs.existsSync(bundled)) {
    const inst = ytdlpModule as unknown as YtRunner & { exec: YtExec };
    return {
      run: inst,
      exec: inst.exec.bind(inst),
      source: `bundled (${bundled})`,
    };
  }
  try {
    const lookup =
      process.platform === "win32" ? "where yt-dlp" : "command -v yt-dlp";
    const sysPath = execSync(lookup).toString().trim().split("\n")[0];
    if (sysPath && fs.existsSync(sysPath)) {
      const inst = create(sysPath) as unknown as YtRunner & { exec: YtExec };
      return {
        run: inst,
        exec: inst.exec.bind(inst),
        source: `system (${sysPath})`,
      };
    }
  } catch {
    // not on PATH
  }
  return null;
}

const yt = resolveYtDlp();
const packagedFfmpeg = packagedBinary("ffmpeg");
const resolvedFfmpeg = packagedFfmpeg || ffmpegPath;
const ffmpegOk = Boolean(resolvedFfmpeg && fs.existsSync(resolvedFfmpeg));

function preflight(): boolean {
  const problems: string[] = [];
  if (!yt) problems.push("yt-dlp");
  if (!ffmpegOk) problems.push("ffmpeg");

  if (problems.length === 0) {
    console.log(`[server] yt-dlp ready: ${yt!.source}`);
    console.log(`[server] ffmpeg ready: ${resolvedFfmpeg}`);
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

// Per-quality bitrate (kbps) estimates used by the client for size estimation.
// For MP4: pick best video format ≤ height cap, add best audio tbr.
// For MP3: fixed by target bitrate (yt-dlp -x transcodes to this).
// Fallback: overall filesize_approx ÷ duration.
interface YtFormat {
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  tbr?: number | null;
  abr?: number | null;
  vbr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
}

function computeBitrates(info: {
  formats?: YtFormat[];
  duration?: number;
  filesize_approx?: number | null;
}) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const duration = Number(info.duration) || 0;

  const videoFormats = formats.filter(
    (f) => f.vcodec && f.vcodec !== "none" && (f.height ?? 0) > 0,
  );
  const audioFormats = formats.filter(
    (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"),
  );

  const bestAudioTbr =
    audioFormats
      .map((f) => f.abr ?? f.tbr ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0] ?? 128;

  function videoTbrAtOrBelow(cap: number | null): number {
    const pool = videoFormats.filter((f) =>
      cap == null ? true : (f.height ?? 0) <= cap,
    );
    const tbr = pool
      .map((f) => f.vbr ?? f.tbr ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0];
    return tbr ?? 0;
  }

  const caps: Record<string, number | null> = {
    best: null,
    "1080": 1080,
    "720": 720,
    "480": 480,
    "360": 360,
  };

  const fallbackTotal =
    duration > 0 && info.filesize_approx
      ? (info.filesize_approx * 8) / 1000 / duration
      : 0;

  const mp4: Record<string, number> = {};
  for (const [key, cap] of Object.entries(caps)) {
    const v = videoTbrAtOrBelow(cap);
    const total = v > 0 ? v + bestAudioTbr : fallbackTotal;
    if (total > 0) mp4[key] = Math.round(total);
  }

  const mp3: Record<string, number> = { "320": 320, "192": 192, "128": 128 };

  return { mp4, mp3 };
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
    }, { env: childEnv() } as any);
    res.json({
      id: info.id,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      bitrates: computeBitrates(info),
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
      ffmpegLocation: resolvedFfmpeg,
    }, { env: childEnv() } as any);

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
  const jobId =
    typeof req.query.jobId === "string" && req.query.jobId
      ? req.query.jobId
      : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Re-probe duration so the cap can't be bypassed by a crafted request.
  try {
    const info = await yt!.run(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
    }, { env: childEnv() } as any);
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
      ? "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[ext=mp4]/best"
      : `bestvideo[ext=mp4][vcodec^=avc1][height<=${quality}]+bestaudio[ext=m4a][acodec^=mp4a]/bestvideo[vcodec^=avc1][height<=${quality}]+bestaudio[acodec^=mp4a]/best[ext=mp4][height<=${quality}]/best[height<=${quality}]`;

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
        ffmpegLocation: resolvedFfmpeg,
      }
    : {
        downloadSections: `*${start.toFixed(2)}-${end.toFixed(2)}`,
        forceKeyframesAtCuts: true,
        noPlaylist: true,
        noWarnings: true,
        format: videoFormat,
        mergeOutputFormat: "mp4",
        remuxVideo: "mp4",
        output: outputPath,
        ffmpegLocation: resolvedFfmpeg,
      };

  const expectedPasses = isAudio ? 1 : 2;
  let passIdx = 0;
  let lastPct = 0;
  const updateFromLine = (line: string) => {
    if (/^\[download\] Destination:/.test(line) || /Downloading \d+ format/.test(line)) {
      if (passIdx < expectedPasses) passIdx = Math.min(passIdx + 1, expectedPasses);
      lastPct = 0;
    }
    const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (m) {
      const pct = Math.min(100, Math.max(0, parseFloat(m[1])));
      if (pct + 5 < lastPct && passIdx < expectedPasses) passIdx = Math.min(passIdx + 1, expectedPasses);
      lastPct = pct;
      const base = Math.max(0, passIdx - 1);
      const overall = Math.min(
        99,
        Math.round(((base + pct / 100) / expectedPasses) * 100),
      );
      publishProgress(jobId, { phase: "downloading", percent: overall });
    }
  };

  try {
    publishProgress(jobId, { phase: "downloading", percent: 0 });
    console.log(`[server] download job=${jobId} using binDir=${BIN_DIR ?? "(none)"}`);
    let stderrTail = "";
    await new Promise<void>((resolve, reject) => {
      const child = yt!.exec(url, options, { env: childEnv() } as any);
      let buf = "";
      const onChunk = (chunk: Buffer | string) => {
        const s = chunk.toString();
        buf += s;
        stderrTail = (stderrTail + s).slice(-4000);
        const parts = buf.split(/\r|\n/);
        buf = parts.pop() || "";
        for (const line of parts) updateFromLine(line);
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
      child.on("error", reject);
      child.on("close", (code) => {
        if (buf) updateFromLine(buf);
        if (code === 0) resolve();
        else {
          const tail = stderrTail
            .split(/\r?\n/)
            .filter((l) => l.trim() && !/^\[download\]\s+\d/.test(l))
            .slice(-8)
            .join("\n")
            .trim();
          console.error(`[server] yt-dlp exit ${code}:\n${tail}`);
          reject(new Error(tail || `yt-dlp exited with code ${code}`));
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      cleanup();
      publishProgress(jobId, { phase: "error", percent: 0, message: "no output" });
      return res.status(500).json({ error: "yt-dlp produced no output" });
    }

    publishProgress(jobId, { phase: "processing", percent: 99 });

    const stat = fs.statSync(outputPath);
    const name = `clip.${ext}`;
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on("close", () => {
      publishProgress(jobId, { phase: "done", percent: 100 });
      cleanup();
    });
    stream.on("error", () => {
      publishProgress(jobId, { phase: "error", percent: 0, message: "stream error" });
      cleanup();
    });
  } catch (e) {
    cleanup();
    publishProgress(jobId, { phase: "error", percent: 0, message: errMessage(e) });
    res.status(500).json({ error: errMessage(e) || "Download failed" });
  }
});

// Progress channel — Server-Sent Events keyed by jobId.
interface ProgressEvent {
  phase: "downloading" | "processing" | "done" | "error";
  percent: number;
  message?: string;
}

interface JobChannel {
  clients: Set<Response>;
  last: ProgressEvent;
  cleanupTimer?: NodeJS.Timeout;
}

const jobs = new Map<string, JobChannel>();

function getOrCreateJob(id: string): JobChannel {
  let job = jobs.get(id);
  if (!job) {
    job = { clients: new Set(), last: { phase: "downloading", percent: 0 } };
    jobs.set(id, job);
  }
  return job;
}

function publishProgress(id: string, evt: ProgressEvent) {
  const job = getOrCreateJob(id);
  job.last = evt;
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      /* ignore */
    }
  }
  if (evt.phase === "done" || evt.phase === "error") {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => {
      for (const c of job.clients) {
        try {
          c.end();
        } catch {
          /* ignore */
        }
      }
      jobs.delete(id);
    }, 5000);
  }
}

app.get("/api/download/progress", (req: Request, res: Response) => {
  const jobId = String(req.query.jobId || "");
  if (!jobId) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const job = getOrCreateJob(jobId);
  job.clients.add(res);
  res.write(`data: ${JSON.stringify(job.last)}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    job.clients.delete(res);
  });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});