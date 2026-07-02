/**
 * File: App.tsx
 * Path: src/App.tsx
 * Description: Root layout — responsive two-column grid, overlay loader, form + preview.
 */
import { AnimatePresence, motion } from "framer-motion";
import { BsDownload } from "react-bootstrap-icons";
import { ClipperProvider, useClipperContext } from "./context/ClipperContext";
import UrlBar from "./components/UrlBar";
import TimeRangeControls from "./components/TimeRangeControls";
import FormatQualityFields from "./components/FormatQualityFields";
import PreviewPanel from "./components/PreviewPanel";
import OverlayLoader from "./components/OverlayLoader";
import { formatTimestamp } from "./lib/clip";

function Meta() {
  const { info, duration, loadingInfo } = useClipperContext();
  return (
    <AnimatePresence mode="wait">
      {info && !loadingInfo ? (
        <motion.div
          key={info.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="opacity-80"
        >
          {info.title} · {formatTimestamp(duration)}
        </motion.div>
      ) : (
        <div className="opacity-60">Paste a URL and press Search to begin</div>
      )}
    </AnimatePresence>
  );
}

function DownloadButton() {
  const { info, downloading, validationError, format, download } =
    useClipperContext();
  return (
    <button
      type="button"
      onClick={download}
      disabled={!info || downloading || Boolean(validationError)}
      className="flex w-full items-center justify-center gap-2 border border-white px-3 py-2.5 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-white"
    >
      <BsDownload />
      <span>
        {downloading ? "Downloading…" : `Download ${format.toUpperCase()}`}
      </span>
    </button>
  );
}

function ErrorBanner() {
  const { error } = useClipperContext();
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          key="err"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="border border-white px-3 py-2.5"
          role="alert"
        >
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Layout() {
  const { loadingInfo, downloading, loadingTranscript } = useClipperContext();
  const overlayVisible = loadingInfo || downloading || loadingTranscript;
  const overlayLabel = downloading
    ? "Downloading clip"
    : loadingInfo
      ? "Loading video info"
      : "Loading transcript";

  return (
    <>
      <OverlayLoader visible={overlayVisible} label={overlayLabel} />

      <main className="flex min-h-full flex-col items-center px-4 py-8">
        <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <h1 className="text-base font-normal uppercase tracking-widest lg:col-span-2">
            YouTube Clipper
          </h1>

          <section className="flex min-w-0 flex-col gap-4">
            <UrlBar />
            <Meta />
            <TimeRangeControls />
            <FormatQualityFields />
            <DownloadButton />
            <ErrorBanner />
          </section>

          <section className="min-w-0">
            <PreviewPanel />
          </section>
        </div>
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