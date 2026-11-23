/**
 * File: bitrates.ts
 * Path: server/utils/bitrates.ts
 * Description: Per-quality bitrate estimates the client uses for size estimation.
 */


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

export function computeBitrates(info: {
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
