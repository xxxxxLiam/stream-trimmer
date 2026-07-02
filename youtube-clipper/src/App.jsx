import { useMemo, useState } from "react";

const MAX_CLIP = 600; // 10 minutes

function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/");
    const i = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
    if (i >= 0) return parts[i + 1];
  } catch {}
  return null;
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

  async function fetchInfo() {
    setError("");
    if (!url) return;
    setLoadingInfo(true);
    setInfo(null);
    try {
      const r = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load video info");
      setInfo(data);
      setStart(0);
      setEnd(Math.min(data.duration, MAX_CLIP));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingInfo(false);
    }
  }

  function validate() {
    if (!url) return "Enter a YouTube URL";
    if (!info) return "Load video info first";
    if (start >= end) return "Start must be before end";
    if (end > info.duration) return "End exceeds video duration";
    if (end - start > MAX_CLIP) return "Clip is capped at 10 minutes";
    return "";
  }

  async function download() {
    const v = validate();
    if (v) { setError(v); return; }
    setError("");
    setDownloading(true);
    try {
      const r = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, start, end }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await r.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `clip-${fmt(start).replaceAll(":", "")}-${fmt(end).replaceAll(":", "")}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  const duration = info?.duration || 0;

  return (
    <div className="app">
      <div className="panel">
        <h1>YouTube Clipper</h1>

        <input
          type="text"
          placeholder="Paste a YouTube URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={fetchInfo}
          onKeyDown={(e) => { if (e.key === "Enter") fetchInfo(); }}
        />

        {videoId ? (
          <div className="preview">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title="preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="preview empty">preview</div>
        )}

        {info && (
          <>
            <div className="meta">{info.title} · {fmt(duration)}</div>

            <div className="range">
              <div className="range-row">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1}
                  value={start}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value), end - 1);
                    setStart(v);
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1}
                  value={end}
                  onChange={(e) => {
                    const v = Math.max(Number(e.target.value), start + 1);
                    setEnd(v);
                  }}
                />
              </div>
              <div className="timestamps">
                <span>{fmt(start)}</span>
                <span>{fmt(end - start)} selected</span>
                <span>{fmt(end)}</span>
              </div>
            </div>
          </>
        )}

        {loadingInfo && <div className="meta">Loading video info…</div>}
        {error && <div className="error">{error}</div>}

        <button onClick={download} disabled={!info || downloading || !!validate()}>
          {downloading ? "Downloading…" : "Download clip"}
        </button>
      </div>
    </div>
  );
}