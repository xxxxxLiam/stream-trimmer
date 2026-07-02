import { useEffect, useMemo, useState } from "react";

const MAX_CLIP_SECONDS = 600;

function formatTimestamp(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const i = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
    return i >= 0 ? parts[i + 1] || null : null;
  } catch {
    return null;
  }
}

async function parseJson(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("Backend not reachable. Run `npm run dev` locally.");
  }
  return response.json();
}

export default function App() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const videoId = useMemo(() => extractVideoId(url), [url]);
  const duration = info?.duration || 0;

  const validationError = useMemo(() => {
    if (!url || !info) return "";
    if (start >= end) return "Start must be before end";
    if (end > info.duration) return "End exceeds video duration";
    if (end - start > MAX_CLIP_SECONDS) return "Clip length capped at 10 minutes";
    return "";
  }, [url, info, start, end]);

  useEffect(() => {
    if (validationError) setError(validationError);
  }, [validationError]);

  async function loadInfo() {
    if (!url) return;
    setError("");
    setInfo(null);
    setLoadingInfo(true);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to load video info");
      setInfo(data);
      setStart(0);
      setEnd(Math.min(data.duration, MAX_CLIP_SECONDS));
    } catch (e) {
      setError(e.message || "Failed to load video info");
    } finally {
      setLoadingInfo(false);
    }
  }

  async function download() {
    if (!info) {
      setError("Load a video first");
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setDownloading(true);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, start, end }),
      });
      if (!res.ok) {
        const data = await parseJson(res).catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `clip-${formatTimestamp(start).replaceAll(":", "")}-${formatTimestamp(end).replaceAll(":", "")}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="app">
      <section className="panel">
        <h1 className="title">YouTube Clipper</h1>

        <div className="url-row">
          <input
            type="url"
            placeholder="Paste a YouTube URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={loadInfo}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadInfo();
            }}
          />
        </div>

        <div className="preview-col">
          <div className="preview">
            {videoId ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <span>preview</span>
            )}
          </div>
        </div>

        <div className="controls">
          {info && (
            <>
              <div className="meta">
                {info.title} · {formatTimestamp(duration)}
              </div>
              <div className="range">
                <input
                  type="range"
                  aria-label="Start time"
                  min={0}
                  max={duration}
                  step={1}
                  value={start}
                  onChange={(e) => setStart(Math.min(Number(e.target.value), end - 1))}
                />
                <input
                  type="range"
                  aria-label="End time"
                  min={0}
                  max={duration}
                  step={1}
                  value={end}
                  onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 1))}
                />
                <div className="timestamps">
                  <span>{formatTimestamp(start)}</span>
                  <span>{formatTimestamp(end - start)} selected</span>
                  <span>{formatTimestamp(end)}</span>
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={download}
            disabled={!info || downloading || Boolean(validationError)}
          >
            {downloading ? "Downloading…" : "Download clip"}
          </button>

          {loadingInfo && <div className="status">Loading video info…</div>}
          {downloading && <div className="status">Downloading clip…</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </section>
    </main>
  );
}