/**
 * File: App.tsx
 * Path: src/App.tsx
 * Description: Root layout — full-viewport two-column grid, overlay loader, form + preview.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Download, Scissors } from "react-bootstrap-icons";
import { ClipperProvider, useClipperContext } from "./context/ClipperContext";
import UrlBar from "./components/UrlBar";
import TimeRangeControls from "./components/TimeRangeControls";
import FormatQualityFields from "./components/FormatQualityFields";
import PreviewPanel from "./components/PreviewPanel";
import OverlayLoader from "./components/OverlayLoader";
import DestinationSelector from "./components/DestinationSelector";
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

  return (
    <div className="flex items-center justify-between border-t border-hairline bg-bg-deep/60 px-4 py-2.5">
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <Scissors size={12} />
        <span>{status}</span>
        {sizeLabel && (
          <>
            <span className="text-fg-faint">·</span>
            <span className="text-fg-faint" title="Approximate — actual size varies with scene bitrate">
              {sizeLabel}
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={download}
        disabled={disabled}
        className="btn-primary text-[12px]"
      >
        <Download size={12} />
        <span>{downloading ? "Downloading" : `Download ${format.toUpperCase()}`}</span>
        <span className="kbd border-white/30 bg-white/10 text-white/90">⌘↵</span>
      </button>
    </div>
  );
}

function Layout() {
  const {
    loadingInfo,
    downloading,
    loadingTranscript,
    downloadProgress,
    downloadPhase,
  } = useClipperContext();
  const overlayVisible = loadingInfo || downloading || loadingTranscript;
  const overlayLabel = downloading
    ? "Downloading clip"
    : loadingInfo
      ? "Loading video info"
      : "Loading transcript";

  return (
    <>
      <OverlayLoader
        visible={overlayVisible}
        label={overlayLabel}
        progress={downloading ? downloadProgress : undefined}
        phase={downloading ? downloadPhase : undefined}
      />

      <main className="flex min-h-screen w-full flex-col bg-panel">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-hairline bg-bg-deep/40 px-4 py-2.5">
          <span className="text-[12px] font-medium tracking-tight text-fg-muted">
            YouTube Clipper
          </span>
          <span className="ml-auto text-[11px] text-fg-faint">Local · Private</span>
        </div>

        {/* Command bar */}
        <div className="border-b border-hairline px-4 py-3">
          <UrlBar />
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-2 lg:items-start lg:p-5">
          <section className="flex min-w-0 flex-col gap-3">
            <Meta />
            <TimeRangeControls />
            <FormatQualityFields />
            <DestinationSelector />
            <ErrorBanner />
          </section>

          <section className="min-w-0">
            <PreviewPanel />
          </section>
        </div>

        <FooterBar />
      </main>
    </>
  );
}

export default function App() {
  return (
    <ClipperProvider>
      <Layout />
    </ClipperProvider>
  );
}
