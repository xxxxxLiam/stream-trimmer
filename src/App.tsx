/**
 * File: App.tsx
 * Path: src/App.tsx
 * Description: Root layout — full-viewport two-column grid, overlay loader, form + preview.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Scissors,
  CheckCircleFill,
  FolderSymlink,
  X,
} from "react-bootstrap-icons";
import { ClipperProvider, useClipperContext } from "./context/ClipperContext";
import { ChannelExportProvider } from "./context/ChannelExportContext";
import ChannelExportPanel from "./components/ChannelExportPanel";
import ChannelLockGate from "./components/ChannelLockGate";
import { isLockConfigured } from "./lib/channelLock";
import UrlBar from "./components/UrlBar";
import TimeRangeControls from "./components/TimeRangeControls";
import FormatQualityFields from "./components/FormatQualityFields";
import PreviewPanel from "./components/PreviewPanel";
import OverlayLoader from "./components/OverlayLoader";
import DestinationSelector from "./components/DestinationSelector";
import UpdateStatus from "./components/UpdateStatus";
import { formatTimestamp } from "./lib/clip";
import { formatBytes } from "./lib/clip";

function Meta() {
  const { info, duration, loadingInfo } = useClipperContext();
  return (
    <AnimatePresence mode="wait">
      {info && !loadingInfo ? (
        <motion.div
          key={info.id}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="flex items-center gap-2 rounded-row bg-panel-hover px-3 py-2 text-[12px] text-fg-muted"
        >
          <span className="truncate text-fg">{info.title}</span>
          <span className="ml-auto shrink-0 tabular-nums text-fg-faint">
            {formatTimestamp(duration)}
          </span>
        </motion.div>
      ) : (
        <div className="rounded-row border border-dashed border-hairline px-3 py-2 text-[12px] text-fg-faint">
          Paste a YouTube URL and press Search to begin
        </div>
      )}
    </AnimatePresence>
  );
}

function ErrorBanner() {
  const { error } = useClipperContext();
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          key="err"
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="rounded-row border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent"
          role="alert"
        >
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FooterBar() {
  const {
    info,
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
    cancelDownload,
  } = useClipperContext();
  const needsSaveDir = isElectron && !saveDir;
  const disabled =
    !info || downloading || Boolean(validationError) || needsSaveDir;
  const status = !info
    ? "Ready"
    : validationError
      ? "Invalid selection"
      : needsSaveDir
        ? "Choose a save folder"
        : `${formatTimestamp(end - start)} clip · ${format.toUpperCase()}`;
  const sizeLabel =
    info && !validationError && estimatedBytes > 0
      ? `~${formatBytes(estimatedBytes)} estimated`
      : "";

  const pct = Math.max(0, Math.min(100, downloadProgress));
  const processing = downloadPhase === "processing";

  return (
    <div className="relative flex items-center justify-between gap-4 border-t border-hairline bg-bg-deep/60 px-4 py-2.5">
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <Scissors size={12} />
        <span>{status}</span>
        {sizeLabel && (
          <>
            <span className="text-fg-faint">·</span>
            <span
              className="text-fg-faint"
              title="Approximate — actual size varies with scene bitrate"
            >
              {sizeLabel}
            </span>
          </>
        )}
      </div>
      {downloading ? (
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">
            {processing ? "Finishing up" : `Downloading ${Math.floor(pct)}%`}
          </span>
          <div className="relative h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-panel-raised">
            {processing ? (
              <motion.div
                className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={cancelDownload}
            className="btn shrink-0 px-2 py-1.5 text-[12px]"
            aria-label="Cancel download"
            title="Cancel download"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={download}
          disabled={disabled}
          className="btn-primary text-[12px]"
        >
          <Download size={12} />
          <span>{`Download ${format.toUpperCase()}`}</span>
          <span className="kbd border-white/30 bg-white/10 text-white/90">
            ⌘↵
          </span>
        </button>
      )}
    </div>
  );
}

function SavedToast() {
  const { savedNotice, dismissSavedNotice, revealSaved, isElectron } =
    useClipperContext();

  // Auto-dismiss after a while; any explicit interaction clears it sooner.
  useEffect(() => {
    if (!savedNotice) return;
    const t = window.setTimeout(() => dismissSavedNotice(), 10000);
    return () => window.clearTimeout(t);
  }, [savedNotice, dismissSavedNotice]);

  const canReveal = isElectron && Boolean(savedNotice?.path);

  return (
    <AnimatePresence>
      {savedNotice && (
        <motion.div
          key="dl-toast"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-panel border border-hairline bg-panel-raised px-4 py-3 shadow-panel"
          role="status"
        >
          <CheckCircleFill size={16} className="shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-fg">
              {savedNotice.kind === "comments"
                ? "Comments exported"
                : "Clip saved"}
            </span>
            <span className="max-w-[220px] truncate text-[11px] text-fg-faint">
              {savedNotice.label}
            </span>
            {savedNotice.detail && (
              <span className="max-w-[260px] text-[11px] text-fg-faint">
                {savedNotice.detail}
              </span>
            )}
          </div>
          {canReveal && (
            <button
              type="button"
              onClick={revealSaved}
              className="btn ml-1 shrink-0 text-[12px]"
            >
              <FolderSymlink size={12} />
              <span>Open folder</span>
            </button>
          )}
          <button
            type="button"
            onClick={dismissSavedNotice}
            className="shrink-0 rounded-chip p-1 text-fg-faint hover:bg-panel-hover hover:text-fg"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Mode = "clip" | "channel";

function ModeTabs({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const tabs: { value: Mode; label: string }[] = [
    { value: "clip", label: "Clip" },
    // Hidden entirely in builds with no passcode configured.
    ...(isLockConfigured()
      ? [{ value: "channel" as Mode, label: "Channel export" }]
      : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <div className="flex rounded-row border border-hairline bg-panel-raised p-0.5">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => setMode(t.value)}
          className={`rounded-chip px-2.5 py-1 text-[12px] transition-colors ${
            mode === t.value
              ? "bg-accent text-white"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Layout() {
  const {
    loadingInfo,
    loadingTranscript,
    exportingComments,
  } = useClipperContext();
  const [mode, setMode] = useState<Mode>("clip");
  const overlayVisible = loadingInfo || loadingTranscript || exportingComments;
  const overlayLabel = exportingComments
    ? "Exporting comments"
    : loadingInfo
      ? "Loading video info"
      : "Loading transcript";

  return (
    <>
      <OverlayLoader visible={overlayVisible} label={overlayLabel} />

      <main className="flex h-screen w-full flex-col overflow-hidden bg-panel">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-hairline bg-bg-deep/40 px-4 py-2.5">
          <span className="text-[12px] font-medium tracking-tight text-fg-muted">
            YouTube Clipper
          </span>
          <ModeTabs mode={mode} setMode={setMode} />
          <div className="ml-auto flex items-center gap-3">
            <UpdateStatus />
            <span className="text-[11px] text-fg-faint">Local · Private</span>
          </div>
        </div>

        {mode === "clip" ? (
          <>
            {/* Command bar */}
            <div className="border-b border-hairline px-4 py-3">
              <UrlBar />
            </div>

            {/* Body */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 lg:grid-cols-2 lg:items-stretch lg:overflow-hidden lg:p-5">
              <section className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                <Meta />
                <TimeRangeControls />
                <FormatQualityFields />
                <DestinationSelector />
                <ErrorBanner />
              </section>

              <section className="flex min-w-0 flex-col lg:min-h-0 lg:overflow-hidden">
                <PreviewPanel />
              </section>
            </div>

            <div className="shrink-0">
              <FooterBar />
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
            <div className="mx-auto w-full max-w-2xl">
              <ChannelLockGate>
                <ChannelExportPanel />
              </ChannelLockGate>
            </div>
          </div>
        )}
      </main>
      <SavedToast />
    </>
  );
}

export default function App() {
  return (
    <ClipperProvider>
      <ChannelExportProvider>
        <Layout />
      </ChannelExportProvider>
    </ClipperProvider>
  );
}
