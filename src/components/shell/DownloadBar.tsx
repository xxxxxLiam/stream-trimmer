/**
 * File: DownloadBar.tsx
 * Path: src/components/shell/DownloadBar.tsx
 * Description: Status strip in the centre column: the real failure text, progress and
 *   Cancel. It has no primary button: the one filled-accent action on screen is MarkBar's
 *   Cut button (also ⌘↵). The clip length lives in MarkBar, so this strip does not repeat it.
 */
import { motion } from "framer-motion";
import { useClipperContext } from "../../context/ClipperContext";
import { formatBytes } from "../../lib/clip";
import { useSegments } from "../../hooks/useSegments";
import { CopyFailureDiagnostics } from "../DiagnosticsDisclosure";
import { redact } from "../../lib/diagnostics";
import type { DownloadFailureInfo } from "../../hooks/useClipper";

/**
 * The engine's text can carry its raw stderr: cookie rows, bearer tokens, the user's email, home
 * paths (F-7). Everything the bar prints from an error goes through here, so the screen shows what
 * the copied report shows: redacted.
 */
export function displayError(error: string, failure: DownloadFailureInfo | null): string {
  return redact(error, { homeDir: failure?.diagnostics?.homeDir });
}

/** The alert above the status strip: the failure sentence and, when it is the developer's, Copy diagnostics. */
export function FailureAlert({ error, failure }: { error: string; failure: DownloadFailureInfo | null }) {
  return (
    <div role="alert" className="card-alert flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-body">
      <span className="min-w-0 flex-[1_1_200px]">{displayError(error, failure)}</span>
      {failure && failure.message === error ? (
        <CopyFailureDiagnostics
          code={failure.code}
          message={failure.message}
          attempt={failure.attempt}
          diagnostics={failure.diagnostics}
        />
      ) : null}
    </div>
  );
}

export default function DownloadBar() {
  const {
    info,
    loadingInfo,
    downloading,
    validationError,
    format,
    estimatedBytes,
    isElectron,
    saveDir,
    downloadProgress,
    downloadPhase,
    downloadNote,
    cancelDownload,
    error,
    failure,
  } = useClipperContext();
  const { segments } = useSegments();
  const hasSegments = segments.length > 0;
  const needsSaveDir = isElectron && !saveDir;

  // Fixes the old bug where a failed /api/info still read "Ready": when there is
  // no video and an error, say the error.
  const failed = !info && !loadingInfo && Boolean(error);
  const shownError = displayError(error, failure);

  const status = failed
    ? shownError
    : loadingInfo
      ? "Loading the video"
      : !info
        ? "Paste a YouTube link to begin"
        : needsSaveDir
          ? "Choose a clips folder in the footer before you cut"
          : validationError && !hasSegments
            ? validationError
            : `Saves as ${format.toUpperCase()}`;

  const sizeLabel =
    info && !hasSegments && !validationError && estimatedBytes > 0
      ? `~${formatBytes(estimatedBytes)} estimated`
      : "";

  const pct = Math.max(0, Math.min(100, downloadProgress));
  const processing = downloadPhase === "processing";

  return (
    <div className="flex flex-col gap-2">
      {error && !failed && error !== validationError && <FailureAlert error={error} failure={failure} />}
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
        ) : null}
      </div>
    </div>
  );
}
