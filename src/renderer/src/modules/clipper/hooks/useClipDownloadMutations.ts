/**
 * File: useClipDownloadMutations.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipDownloadMutations.ts
 * Description: Cuts the clip: progress, cancel, the engine request and saving the result.
 */
import type { ClipRowState } from "../../../../../common/types/clipRowState";
import { useCallback, useRef, useState } from "react";
import { formatTimestamp, extractVideoId, normalizeYouTubeUrl, parseJson, apiUrl, buildClipFilename, sanitizeFilename, type ClipFormat, type VideoInfo } from "../../../shared/utils/clip";
import { type FailureDiagnostics } from "../../../shared/utils/diagnostics";
import { connectionNow, cookiePayload, isSignedOut, markDisconnected, requestedQuality, useYouTubeConnection, whenSignInSettled } from "../../../shared/utils/youtubeConnection";
import { addDownload } from "../../../shared/utils/downloads";
import { ROOM_REASON, roomProblem } from "../../../shared/utils/freeSpace";
import { type DownloadFailureInfo, type DownloadOptions } from "../utils/clipperTypes";
import { DownloadCancelledError, DownloadFailureError, isCancelledResponse, isQuietCancel, requestEngineCancel, saveFailure, videoUrlProblem } from "../utils/downloadErrors";
import { type SavedFiles } from "./useSavedFilesState";

export function useClipDownloadMutations({
  info,
  url,
  start,
  end,
  format,
  quality: qualityArg,
  isElectron,
  saveDir,
  connection,
  validationError,
  setError,
  setLastSavedPath,
  setSavedNotice,
}: {
  info: VideoInfo | null;
  url: string;
  start: number;
  end: number;
  format: ClipFormat;
  quality: string;
  isElectron: boolean;
  saveDir: string | null;
  connection: ReturnType<typeof useYouTubeConnection>;
  validationError: string;
  setError: (v: string) => void;
  setLastSavedPath: SavedFiles["setLastSavedPath"];
  setSavedNotice: SavedFiles["setSavedNotice"];
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState<
    "idle" | "downloading" | "processing" | "done" | "error"
  >("idle");
  // Set when the engine reports it is continuing a previously interrupted
  // download, so the status bar can say so instead of looking like a restart.
  const [downloadNote, setDownloadNote] = useState("");
  const downloadAbortRef = useRef<AbortController | null>(null);
  const downloadJobRef = useRef<string | null>(null);
  const [failure, setFailure] = useState<DownloadFailureInfo | null>(null);

  const cancelDownload = useCallback(() => {
    const jobId = downloadJobRef.current;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    downloadJobRef.current = null;
    if (jobId) {
      // The engine ends the job's yt-dlp/ffmpeg children on this call. (Server side is G-10.)
      void requestEngineCancel(jobId, (path, body) =>
        fetch(apiUrl(path), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    }
  }, []);

  /**
   * Cuts the clip. With no argument it cuts the in/out range as before. `opts.segments`
   * cuts a list of ranges joined, in order, into one file (the server concatenates).
   * `opts.clipId` names the file after the campaign's clip id. Resolves true when the
   * clip was saved, so the caller can record the used ranges.
   */
  const download = useCallback(async (opts?: DownloadOptions): Promise<boolean> => {
    if (!info) {
      setError("Load a video first");
      return false;
    }
    const sourceProblem = videoUrlProblem(url);
    if (sourceProblem) {
      setError(sourceProblem);
      return false;
    }
    const multi = opts?.segments && opts.segments.length > 0 ? opts.segments : null;
    // The in/out fields only matter when no segment list is given.
    if (!multi && validationError) {
      setError(validationError);
      return false;
    }
    const segs = multi ?? [{ start, end }];
    const cutStart = segs[0].start;
    const cutEnd = segs[segs.length - 1].end;
    let saved = false;
    setError("");
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadPhase("downloading");
    setDownloadNote("");
    setSavedNotice(null);
    setFailure(null);
    // A clip made in the first seconds waits for the launch sign-in check, then asks for the quality its result allows.
    await whenSignInSettled();
    const quality = requestedQuality({ signedOut: isSignedOut(connectionNow()), format, quality: qualityArg });
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    // When the desktop app has somewhere to put the clip, the engine hands
    // back its location and the main process moves the file. Only then does
    // the media avoid the UI entirely; every other case still streams.
    const deliverPath = Boolean(
      isElectron && window.electronAPI?.saveClip && saveDir,
    );
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    downloadJobRef.current = jobId;
    let es: EventSource | null = null;
    try {
      // Before anything is fetched: a folder that is clearly short of room says so on the clip's row, and the clip waits.
      if (isElectron && saveDir && window.electronAPI?.checkFreeSpace) {
        const seconds = segs.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
        let answer: Awaited<ReturnType<NonNullable<typeof window.electronAPI.checkFreeSpace>>> | null = null;
        try {
          answer = await window.electronAPI.checkFreeSpace({ dirPath: saveDir, seconds, quality: String(quality), audio: format !== "mp4", segments: segs.length });
        } catch {
          /* no answer: the clip goes ahead */
        }
        const room = roomProblem(answer);
        if (room) {
          const refused = new DownloadFailureError(ROOM_REASON, "disk_full");
          refused.room = room;
          throw refused;
        }
      }
      es = new EventSource(
        apiUrl(`/api/download/progress?jobId=${encodeURIComponent(jobId)}`),
      );
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            phase: "downloading" | "processing" | "done" | "error";
            percent: number;
            message?: string;
          };
          setDownloadPhase(data.phase);
          if (data.phase === "downloading" && data.message)
            setDownloadNote(data.message);
          if (typeof data.percent === "number") {
            setDownloadProgress((prev) =>
              data.phase === "downloading"
                ? Math.max(prev, data.percent)
                : data.percent,
            );
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* EventSource unavailable — proceed without progress */
    }
    try {
      const res = await fetch(
        apiUrl(`/api/download?jobId=${encodeURIComponent(jobId)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            url: normalizeYouTubeUrl(url),
            ...(segs.length > 1 ? { segments: segs } : { start: cutStart, end: cutEnd }),
            format,
            quality,
            ...(opts?.audioLanguage ? { audioLanguage: opts.audioLanguage } : {}),
            deliver: deliverPath ? "path" : "stream",
            ...cookiePayload(),
          }),
        },
      );
      if (!res.ok) {
        type FailureBody = {
          error?: string;
          code?: string;
          diagnostics?: FailureDiagnostics;
          row?: ClipRowState;
          cancelled?: boolean;
        };
        const data = await parseJson<FailureBody>(res).catch(
          () => ({}) as FailureBody,
        );
        if (isCancelledResponse(res.status, data)) throw new DownloadCancelledError();
        if (data.code === "YOUTUBE_AUTH_REQUIRED") {
          markDisconnected(data.error);
        }
        throw new DownloadFailureError(
          data.error || "Download failed",
          data.code,
          data.diagnostics,
          data.row,
        );
      }
      // For `deliver: "path"` the body is a few bytes of JSON naming the
      // finished file, not the clip itself.
      const handoff = deliverPath
        ? await parseJson<{ path: string; size: number }>(res)
        : null;
      const blob = deliverPath ? null : await res.blob();
      const ext = format === "mp3" ? "mp3" : "mp4";
      const filename = opts?.clipId
        ? `${sanitizeFilename(opts.clipId)}.${ext}`
        : buildClipFilename(info.title, cutStart, cutEnd, ext);
      // What the server actually produced — YouTube may only serve renditions
      // below the requested height, in which case the clip is still valid.
      const deliveredHeight = Number(res.headers.get("X-Delivered-Height"));
      const deliveredKbps = Number(res.headers.get("X-Delivered-Audio-Kbps"));
      const availableHeights = (res.headers.get("X-Available-Heights") || "")
        .split(",")
        .map((h) => Number(h))
        .filter((h) => h > 0);
      const authMode = res.headers.get("X-Auth-Mode") || "";
      const requestedHeight = Number(quality);
      let detail: string | undefined;
      if (format === "mp3") {
        detail = deliveredKbps ? `Downloaded at ${deliveredKbps} kbps.` : undefined;
      } else if (deliveredHeight) {
        if (requestedHeight && deliveredHeight < requestedHeight) {
          const offered = availableHeights.length
            ? ` YouTube offered ${availableHeights
                .slice(0, 6)
                .map((h) => `${h}p`)
                .join(", ")}.`
            : "";
          const signedOut =
            authMode === "none"
              ? " This download ran without a YouTube sign-in."
              : "";
          detail = `Downloaded at ${deliveredHeight}p instead of ${requestedHeight}p.${offered}${signedOut}`;
        } else {
          detail = `Downloaded at ${deliveredHeight}p.`;
        }
      }

      if (isElectron && window.electronAPI && saveDir) {
        const result = handoff
          ? await window.electronAPI.saveClip!({
              tempPath: handoff.path,
              dirPath: saveDir,
              filename,
            })
          : await window.electronAPI.saveFile({
              dirPath: saveDir,
              filename,
              data: await blob!.arrayBuffer(),
            });
        if (!result.ok) {
          // A full or unwritable folder is its own failure (Change folder), not "YouTube stopped it".
          const folder = saveFailure(result);
          throw folder.code ? new DownloadFailureError(folder.reason ?? result.error ?? "", folder.code) : new Error(result.error);
        }
        setLastSavedPath(result.path ?? null);
        // The name the file really got: a taken name is saved as "... 2".
        const savedName = result.fileName ?? filename;
        setSavedNotice({
          kind: "clip",
          path: result.path ?? "",
          label: savedName,
          detail,
        });
        addDownload({
          kind: "clip",
          label: savedName,
          path: result.path ?? "",
          dir: saveDir,
          detail:
            detail ??
            `${segs.map((r) => `${formatTimestamp(r.start)} – ${formatTimestamp(r.end)}`).join("; ")} · ${format.toUpperCase()}`,
        });
      } else {
        setLastSavedPath(null);
        const objectUrl = URL.createObjectURL(blob!);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking on this tick cancels the download the click just started:
        // the browser has not read the blob yet, and the request fails with
        // a bare ERR_FAILED. Hold the URL until the transfer can have run.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        setSavedNotice({ kind: "clip", path: "", label: filename, detail });
        addDownload({
          kind: "clip",
          label: filename,
          path: "",
          dir: null,
          detail,
        });
      }
      setDownloadProgress(100);
      setDownloadPhase("done");
      saved = true;
    } catch (e) {
      if (isQuietCancel(e)) {
        setDownloadPhase("idle");
      } else {
        const raw = e instanceof Error ? e.message : "Download failed";
        const engineFailure = e instanceof DownloadFailureError ? e : null;
        // A bare "Failed to fetch" is what fetch() rejects with for any
        // transport-level failure. Left as-is it sends people hunting for a
        // YouTube or sign-in problem, when the clip itself built fine and
        // only the local transfer broke.
        const transportFailure =
          /failed to fetch|networkerror|load failed|network request failed/i.test(
            raw,
          );
        const message = transportFailure
          ? "The clip was built, but the transfer from the local engine broke before it finished. This is not a YouTube or sign-in problem. Copy the diagnostics for the reason."
          : raw;
        setError(message);
        setFailure({
          message,
          code: engineFailure?.code,
          diagnostics: engineFailure?.diagnostics,
          row: engineFailure?.row,
          room: engineFailure?.room,
          attempt: {
            operation: "download clip",
            videoId: extractVideoId(url),
            segments: segs,
            format,
            quality,
          },
        });
        setDownloadPhase("error");
      }
    } finally {
      es?.close();
      downloadAbortRef.current = null;
      if (downloadJobRef.current === jobId) downloadJobRef.current = null;
      setDownloading(false);
      window.setTimeout(() => {
        setDownloadPhase("idle");
        setDownloadProgress(0);
      }, 1200);
    }
    return saved;
  }, [
    info,
    validationError,
    url,
    start,
    end,
    format,
    qualityArg,
    isElectron,
    saveDir,
    connection,

  ]);

  return {
    downloading,
    downloadProgress,
    downloadPhase,
    downloadNote,
    failure,
    download,
    cancelDownload,
  };
}
