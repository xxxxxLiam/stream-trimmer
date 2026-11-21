/**
 * File: DownloadBar.tsx
 * Path: src/components/shell/DownloadBar.tsx
 * Description: Interim primary action in the centre column: status, real failure
 *   text, progress and the single filled-accent Download button (⌘↵). Carries the
 *   existing download() call unchanged. TODO(Phase C): fold into MarkBar's
 *   "Cut as one file" so there is exactly one primary action on screen.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useClipperContext } from "../../context/ClipperContext";
import { useIsTabActive } from "../../context/WorkspaceContext";
import { formatBytes, formatTimestamp } from "../../lib/clip";

export default function DownloadBar() {
  const {
    info,
    loadingInfo,
    downloading,
    validationError,
    format,
    download,
    start,
    end,
    estimatedBytes,
    isElectron,
    saveDir,
    downloadProgress,
    downloadPhase,
    downloadNote,
    cancelDownload,
    error,
  } = useClipperContext();
  const active = useIsTabActive();

  const needsSaveDir = isElectron && !saveDir;
  const disabled =
    !info || downloading || Boolean(validationError) || needsSaveDir;

  // Fixes the old bug where a failed /api/info still read "Ready": when there is
  // no video and an error, say the error.
  const failed = !info && !loadingInfo && Boolean(error);
  const status = failed
    ? error
    : loadingInfo
      ? "Loading the video"
      : !info
        ? "Paste a YouTube link to begin"
        : validationError
          ? validationError
          : needsSaveDir
            ? "Choose a clips folder in the footer"
            : `${formatTimestamp(end - start)} clip · ${format.toUpperCase()}`;
  const sizeLabel =
    info && !validationError && estimatedBytes > 0
      ? `~${formatBytes(estimatedBytes)} estimated`
      : "";

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (!disabled) void download();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, disabled, download]);

  const pct = Math.max(0, Math.min(100, downloadProgress));
  const processing = downloadPhase === "processing";

  return (
    <div className="flex flex-col gap-2">
      {error && !failed && error !== validationError && (
        <div role="alert" className="card-alert px-3 py-2 text-body">
          {error}
        </div>
      )}
      <div className="surface-panel flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <div
          className={`min-w-0 flex-[1_1_160px] text-body ${failed ? "card-alert px-3 py-2" : "text-fg-dim"}`}
          role={failed ? "alert" : "status"}
        >
          <span>{status}</span>
          {sizeLabel && !failed && (
            <span className="text-meta" title="Approximate. Actual size varies with scene bitrate.">
              {" · "}
              {sizeLabel}
            </span>
          )}
        </div>
        {downloading ? (
          <div className="flex min-w-0 flex-[1_1_240px] items-center justify-end gap-3">
            <span className="shrink-0 font-mono text-meta text-fg-dim">
              {processing
                ? "Finishing up"
                : downloadNote && pct === 0
                  ? downloadNote
                  : `Downloading ${Math.floor(pct)}%`}
            </span>
            <div className="relative h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-panel-raised">
              {processing ? (
                <motion.div
                  className="absolute inset-y-0 w-1/3 rounded-full bg-range-fill opacity-70"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-range-fill shadow-range-glow"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                />
              )}
            </div>
            <button type="button" onClick={cancelDownload} className="btn shrink-0">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="ui-primary-action"
            onClick={() => void download()}
            disabled={disabled}
            className="btn-primary"
          >
            <span>{`Download ${format.toUpperCase()}`}</span>
            <span className="kbd border-black/20 bg-black/10 text-on-accent">⌘↵</span>
          </button>
        )}
      </div>
    </div>
  );
}
