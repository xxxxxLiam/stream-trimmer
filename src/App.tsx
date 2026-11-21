/**
 * File: App.tsx
 * Path: src/App.tsx
 * Description: Root layout. Header, three-column workspace (transcript | centre | clips),
 *   footer, and the Phase B mount points. See BUILD-SPEC sections 3 and 12.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircleFill, FolderSymlink, X } from "react-bootstrap-icons";
import { ClipperProvider, useClipperContext } from "./context/ClipperContext";
import {
  ChannelExportProvider,
  useChannelExportContext,
} from "./context/ChannelExportContext";
import {
  WorkspaceProvider,
  TabActiveProvider,
  useWorkspace,
} from "./context/WorkspaceContext";
import { CampaignProvider, useCampaign } from "./context/CampaignContext";
import WorkspaceTabs from "./components/WorkspaceTabs";
import ChannelExportPanel from "./components/ChannelExportPanel";
import ChannelLockGate from "./components/ChannelLockGate";
import { isLockConfigured } from "./lib/channelLock";
import PreviewPanel from "./components/PreviewPanel";
import OverlayLoader from "./components/OverlayLoader";
import DragOutHandle from "./components/DragOutHandle";
import YouTubeConnectModal from "./components/YouTubeConnectModal";
import { clearSegments, useSegments } from "./hooks/useSegments";
import type { Segment } from "./lib/segments";
import {
  restoreConnection,
  useYouTubeConnection,
} from "./lib/youtubeConnection";
// Shell
import AppHeader from "./components/shell/AppHeader";
import AppFooter from "./components/shell/AppFooter";
import ThreeColumnLayout from "./components/shell/ThreeColumnLayout";
import DownloadBar from "./components/shell/DownloadBar";
// Phase B mount points. Replace the files, never this wiring.
import CampaignMenu from "./components/CampaignMenu";
import TranscriptColumn from "./components/TranscriptColumn"; // B3, left column
import Timeline from "./components/Timeline"; // B2, centre under video
import MarkBar from "./components/MarkBar"; // B2, centre under Timeline
import ClipsColumn from "./components/ClipsColumn"; // B2/B4, right column
import HelpDrawer from "./components/HelpDrawer"; // B6, right drawer
import SymbolPalette from "./components/SymbolPalette"; // B5, overlay
import CopyBlocks from "./components/CopyBlocks"; // B5, overlay

function SavedToast() {
  const { savedNotice, dismissSavedNotice, revealSaved, isElectron } =
    useClipperContext();

  // Deliberately sticky: the notice stays until the user opens the folder or
  // dismisses it explicitly. No auto-dismiss timer.

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
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-panel border border-hairline surface-raised px-4 py-3 shadow-panel"
          role="status"
        >
          <CheckCircleFill size={16} className="shrink-0 text-accent" />
          <DragOutHandle
            path={savedNotice.path}
            isElectron={isElectron}
            label={savedNotice.label}
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-body font-medium text-fg">
              {savedNotice.kind === "comments"
                ? "Comments exported"
                : "Clip saved"}
            </span>
            <span className="max-w-[220px] truncate text-meta text-fg-dim">
              {savedNotice.label}
            </span>
            {savedNotice.detail && (
              <span className="max-w-[260px] text-meta text-fg-dim">
                {savedNotice.detail}
              </span>
            )}
          </div>
          {canReveal && (
            <button
              type="button"
              onClick={revealSaved}
              className="btn ml-1 shrink-0"
            >
              <FolderSymlink size={16} />
              <span>Open folder</span>
            </button>
          )}
          <button
            type="button"
            onClick={dismissSavedNotice}
            className="icon-btn"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Publishes this tab's title and busy state up to the workspace tab strip. */
function TabReporter({ id }: { id: string }) {
  const { info, downloading, exportingComments, loadingInfo, cancelDownload } =
    useClipperContext();
  const { exporting, channelUrl, cancelExport } = useChannelExportContext();
  const { reportTab } = useWorkspace();

  const title = info?.title || (channelUrl ? channelUrl : "");
  const busy = downloading || exportingComments || loadingInfo || exporting;

  const cancelRef = useRef<() => void>(() => {});
  cancelRef.current = () => {
    cancelDownload();
    cancelExport();
  };

  useEffect(() => {
    reportTab(id, {
      title,
      busy,
      cancel: () => cancelRef.current(),
    });
  }, [id, title, busy, reportTab]);

  return null;
}

function Layout({ active }: { active: boolean }) {
  const {
    exportingComments,
    revealLastSaved,
    isElectron,
    saveDir,
    setSaveDir,
    format,
    quality,
    setFormat,
    setQuality,
    videoId,
    download,
    downloads,
    setStartText,
    setEndText,
  } = useClipperContext();
  const {
    active: campaign,
    folders,
    update,
    nextClipId,
    recordUse,
    pickClipsDir,
    pickDataDir,
  } = useCampaign();
  const { playhead } = useSegments();
  const [screen, setScreen] = useState<"workspace" | "channel">("workspace");
  const [helpOpen, setHelpOpen] = useState(false);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const channelAvailable = isLockConfigured();

  // Loading video info renders inline; the overlay is reserved for the
  // blocking comment export.
  const overlayVisible = active && exportingComments;

  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeSymbols = useCallback(() => setSymbolsOpen(false), []);
  const closeCopy = useCallback(() => setCopyOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Switching campaign re-points the saving folder, format and quality at once. The clips
  // folder lives on the campaign; the clipper still saves to its own saveDir, so mirror it.
  useEffect(() => {
    if (isElectron && folders.clipsDir && folders.clipsDir !== saveDir) {
      setSaveDir(folders.clipsDir);
    }
  }, [isElectron, folders.clipsDir, saveDir, setSaveDir]);

  const campaignId = campaign?.id ?? null;
  // True from the moment a switch asks the clipper to change format/quality until it has.
  // Without it the write-back below would copy the OLD values over the new campaign.
  const repointing = useRef(false);
  useEffect(() => {
    if (!campaign) return;
    repointing.current = campaign.format !== format || campaign.quality !== quality;
    setFormat(campaign.format);
    setQuality(campaign.quality);
    // Only a switch (or first load) re-points; later edits flow the other way below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Format and quality are set in the footer and belong to the campaign.
  useEffect(() => {
    if (!campaign) return;
    const same = campaign.format === format && campaign.quality === quality;
    if (repointing.current) {
      if (same) repointing.current = false;
      return;
    }
    if (!same) update(campaign.id, { format, quality });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, quality]);

  // Cut: name the clip from the campaign pattern, then record its ranges as used so the
  // no-reuse check and the bank stay in agreement with no bookkeeping.
  const cutClip = useCallback(
    async (segments: Segment[]) => {
      if (!videoId || segments.length === 0) return;
      const cutCampaignId = campaign?.id;
      const taken = downloads.map((d) => d.label.replace(/\.[^.]+$/, ""));
      const clipId = campaign ? nextClipId(videoId, taken) : null;
      const ok = await download({ segments, clipId: clipId ?? undefined });
      if (!ok) return;
      if (cutCampaignId && clipId) recordUse(videoId, segments, clipId, cutCampaignId);
      clearSegments();
      setStartText("");
      setEndText("");
    },
    [videoId, campaign, downloads, nextClipId, download, recordUse, setStartText, setEndText],
  );

  // Shell-level shortcuts (BUILD-SPEC section 12). Active tab only.
  const revealRef = useRef(revealLastSaved);
  revealRef.current = revealLastSaved;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "/" && !e.shiftKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      } else if (k === ";" && !e.shiftKey) {
        e.preventDefault();
        setSymbolsOpen((v) => !v);
      } else if (k === "c" && e.shiftKey) {
        e.preventDefault();
        setCopyOpen((v) => !v);
      } else if (k === "," && !e.shiftKey) {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (k === "r" && !e.shiftKey) {
        e.preventDefault();
        revealRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      <OverlayLoader visible={overlayVisible} label="Exporting comments" />

      <main className="flex h-full w-full flex-col overflow-hidden">
        <AppHeader
          screen={screen}
          onScreen={setScreen}
          channelAvailable={channelAvailable}
          copyOpen={copyOpen}
          onToggleCopy={() => setCopyOpen((v) => !v)}
          symbolsOpen={symbolsOpen}
          onToggleSymbols={() => setSymbolsOpen((v) => !v)}
          helpOpen={helpOpen}
          onToggleHelp={() => setHelpOpen((v) => !v)}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
          onCloseSettings={closeSettings}
          campaignMenu={<CampaignMenu />}
        />

        {screen === "workspace" ? (
          <ThreeColumnLayout
            transcript={<TranscriptColumn playhead={playhead} />}
            centre={
              <>
                <PreviewPanel />
                <Timeline />
                <MarkBar onCut={(segs) => void cutClip(segs)} />
                <DownloadBar />
              </>
            }
            clips={<ClipsColumn />}
            drawer={<HelpDrawer open={helpOpen} onClose={closeHelp} />}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
                {/* Channel exporter stays hidden unless a passcode is baked in. */}
                {channelAvailable && (
                  <ChannelLockGate>
                    <ChannelExportPanel />
                  </ChannelLockGate>
                )}
              </div>
            </div>
            <HelpDrawer open={helpOpen} onClose={closeHelp} />
          </div>
        )}

        <AppFooter
          onPickClipsDir={isElectron ? pickClipsDir : undefined}
          onPickDataDir={isElectron ? pickDataDir : undefined}
        />
      </main>

      <SymbolPalette open={symbolsOpen} onClose={closeSymbols} />
      <CopyBlocks open={copyOpen} onClose={closeCopy} />
      {active && <SavedToast />}
    </>
  );
}

function Shell() {
  const { tabs, activeId } = useWorkspace();
  const connection = useYouTubeConnection();

  // No background polling. On launch we read the imported cookies.txt once
  // and verify it silently; after that the user checks when they choose.
  useEffect(() => {
    void restoreConnection();
  }, []);

  return (
    <div className="surface-ground flex h-screen w-full flex-col overflow-hidden">
      {/* Workspace tabs (multiple videos). Kept from v3; the header below is per tab. */}
      <div className="flex items-center border-b border-hairline px-3 py-1">
        <WorkspaceTabs />
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ display: active ? undefined : "none" }}
            >
              <ClipperProvider>
                <ChannelExportProvider>
                  <TabActiveProvider active={active}>
                    <TabReporter id={tab.id} />
                    <Layout active={active} />
                  </TabActiveProvider>
                </ChannelExportProvider>
              </ClipperProvider>
            </div>
          );
        })}
      </div>

      <YouTubeConnectModal open={!connection.connected || connection.restoring} />
    </div>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <CampaignProvider>
        <Shell />
      </CampaignProvider>
    </WorkspaceProvider>
  );
}
