/**
 * File: index.tsx
 * Path: src/routes/index.tsx
 * Description: Provides the local YouTube clipper UI and download workflow.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

const MAX_CLIP_SECONDS = 600;
const ONE_SECOND = 1;
const EMBED_PATH_MARKERS = ["embed", "shorts", "v"];

export const Route = createFileRoute("/")({
  component: YouTubeClipperPage,
});

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function extractVideoId(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("youtu.be")) {
      return parsedUrl.pathname.slice(1) || null;
    }

    const queryVideoId = parsedUrl.searchParams.get("v");
    if (queryVideoId) {
      return queryVideoId;
    }

    const pathParts = parsedUrl.pathname.split("/");
    const markerIndex = pathParts.findIndex((part) => EMBED_PATH_MARKERS.includes(part));

    return markerIndex >= 0 ? pathParts[markerIndex + 1] || null : null;
  } catch {
    return null;
  }
}

type VideoInfo = {
  id: string;
  title: string;
  duration: number;
  thumbnail?: string;
};

function getErrorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

function hasErrorMessage(data: unknown): data is { error: string } {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string";
}

function isVideoInfo(data: unknown): data is VideoInfo {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    "title" in data &&
    "duration" in data &&
    typeof data.id === "string" &&
    typeof data.title === "string" &&
    typeof data.duration === "number"
  );
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Backend not reachable. Run `npm run dev` on your own machine and open http://localhost:5173 — the Lovable preview cannot run yt-dlp or ffmpeg.",
    );
  }
  return response.json();
}

function YouTubeClipperPage() {
  const [isLocal, setIsLocal] = useState(true);

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocal(host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0");
  }, []);

  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  const videoId = useMemo(() => extractVideoId(url), [url]);
  const duration = info?.duration || 0;

  const validationMessage = useMemo(() => {
    if (!url) {
      return "Enter a YouTube URL";
    }

    if (!info) {
      return "Load video info first";
    }

    if (start >= end) {
      return "Start must be before end";
    }

    if (end > info.duration) {
      return "End exceeds video duration";
    }

    if (end - start > MAX_CLIP_SECONDS) {
      return "Clip is capped at 10 minutes";
    }

    return "";
  }, [end, info, start, url]);

  async function fetchInfo() {
    setError("");

    if (!url) {
      return;
    }

    setIsLoadingInfo(true);
    setInfo(null);

    try {
      const response = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: unknown = await parseJsonOrThrow(response);

      if (!response.ok || hasErrorMessage(data)) {
        throw new Error(hasErrorMessage(data) ? data.error : "Failed to load video info");
      }

      if (!isVideoInfo(data)) {
        throw new Error("Video info response was invalid");
      }

      setInfo(data);
      setStart(0);
      setEnd(Math.min(data.duration, MAX_CLIP_SECONDS));
    } catch (caught) {
      setError(getErrorMessage(caught, "Failed to load video info"));
    } finally {
      setIsLoadingInfo(false);
    }
  }

  async function downloadClip() {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setError("");
    setIsDownloading(true);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, start, end }),
      });

      if (!response.ok) {
        const data = (await parseJsonOrThrow(response).catch((caught) => {
          throw caught instanceof Error ? caught : new Error("Download failed");
        })) as { error?: string };
        throw new Error(data?.error || "Download failed");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `clip-${formatTimestamp(start).replaceAll(":", "")}-${formatTimestamp(end).replaceAll(":", "")}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (caught) {
      setError(getErrorMessage(caught, "Download failed"));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="clipper-app">
      <section className="clipper-panel" aria-labelledby="clipper-title">
        <h1 id="clipper-title">YouTube Clipper</h1>

        {!isLocal ? (
          <div className="clipper-error" role="status">
            This app requires the local backend (yt-dlp + ffmpeg). Clone the repo, run
            {" "}<code>npm run dev</code>{" "}on your own machine, and open{" "}
            <code>http://localhost:5173</code>. The Lovable preview only serves the UI.
          </div>
        ) : null}

        <input
          type="url"
          placeholder="Paste a YouTube URL"
          value={url}
          onBlur={fetchInfo}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              fetchInfo();
            }
          }}
          disabled={!isLocal}
        />

        {videoId ? (
          <div className="clipper-preview">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title="YouTube video preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="clipper-preview clipper-preview-empty">preview</div>
        )}

        {info ? (
          <>
            <div className="clipper-meta">
              {info.title} · {formatTimestamp(duration)}
            </div>

            <div className="clipper-range">
              <div className="clipper-range-row">
                <input
                  aria-label="Clip start time"
                  type="range"
                  min={0}
                  max={duration}
                  step={ONE_SECOND}
                  value={start}
                  onChange={(event) => {
                    setStart(Math.min(Number(event.target.value), end - ONE_SECOND));
                  }}
                />
                <input
                  aria-label="Clip end time"
                  type="range"
                  min={0}
                  max={duration}
                  step={ONE_SECOND}
                  value={end}
                  onChange={(event) => {
                    setEnd(Math.max(Number(event.target.value), start + ONE_SECOND));
                  }}
                />
              </div>
              <div className="clipper-timestamps">
                <span>{formatTimestamp(start)}</span>
                <span>{formatTimestamp(end - start)} selected</span>
                <span>{formatTimestamp(end)}</span>
              </div>
            </div>
          </>
        ) : null}

        {isLoadingInfo ? <div className="clipper-meta">Loading video info…</div> : null}
        {error ? <div className="clipper-error">{error}</div> : null}

        <button
          type="button"
          onClick={downloadClip}
          disabled={!isLocal || !info || isDownloading || Boolean(validationMessage)}
        >
          {isDownloading ? "Downloading…" : "Download clip"}
        </button>
      </section>
    </main>
  );
}
