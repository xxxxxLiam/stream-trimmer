/**
 * File: App.tsx
 * Path: src/renderer/src/routes/App.tsx
 * Description: Root layout. Header, three-column workspace (transcript | centre | clips),
 *   footer, and the Phase B mount points. See BUILD-SPEC sections 3 and 12.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircleFill, FolderSymlink, X } from "react-bootstrap-icons";
import { ClipperProvider, useClipperContext } from "../modules/clipper/hooks/ClipperContext";
import {
  ChannelExportProvider,
  useChannelExportContext,
} from "../features/channelExport/hooks/ChannelExportContext";
import {
  WorkspaceProvider,
  TabActiveProvider,
  useWorkspace,
} from "../features/workspace/hooks/WorkspaceContext";
import { CampaignProvider, CampaignTabScope, useCampaign } from "../features/campaigns/hooks/CampaignContext";
import ErrorBoundary from "../shared/components/ErrorBoundary";
import ChannelExportPanel from "../features/channelExport/components/ChannelExportPanel";
import { CHANNEL_DATA_BUILT, useOwnerAccess } from "../shared/utils/ownerGate";
import EditorHandoff, { runAfterCutting } from "../features/handoff/components/EditorHandoff";
import {
  DEFAULT_EDITOR_SETTINGS,
  normalizeEditorSettings,
  type EditorHandoffSettings,
  type SessionClip,
} from "../shared/utils/fcpxml";
import { annotateDownload, getDownloads } from "../shared/utils/downloads";
import { addSessionClip, sessionClipsFor, type SessionClipsByCampaign } from "../shared/utils/handoff";
import { readSetting, writeSetting } from "../shared/utils/persist";
import type { BankedClip } from "../shared/utils/bank";
import OverlayLoader from "../shared/components/OverlayLoader";
import DragOutHandle from "../shared/components/DragOutHandle";
import YouTubeConnectModal from "../features/youtubeConnection/components/YouTubeConnectModal";
import { useSegmentsState } from "../shared/hooks/useSegmentsState";
import type { Segment } from "../shared/utils/segments";
import {
  restoreConnection,
  useYouTubeConnection,
} from "../shared/utils/youtubeConnection";
// Shell
import TopBar from "../modules/layout/components/TopBar";
import BottomBar from "../modules/layout/components/BottomBar";
import type { MenuItem } from "../modules/layout/components/PopoverMenu";
import { useAudioLanguageState } from "../modules/layout/hooks/useAudioLanguageState";
import { nameForLanguage, planLanguages } from "../shared/utils/audioLanguages";
import PanelWorkspace from "../modules/layout/components/PanelWorkspace";
import PanelsMenu from "../modules/layout/components/PanelsMenu";
import { PanelHostProvider, type PanelHost } from "../modules/layout/hooks/PanelHostContext";
import { buildCopyBlocksInput } from "../features/handoff/utils/copyBlocksInput";
// Phase B mount points. Replace the files, never this wiring.
import CampaignMenu from "../features/campaigns/components/CampaignMenu";
import HelpDrawer from "../features/help/components/HelpDrawer"; // B6, right drawer
import SymbolPalette from "../features/handoff/components/SymbolPalette"; // B5, overlay
import CampaignStart from "../features/campaigns/components/CampaignStart";
import CopyBlocks from "../features/handoff/components/CopyBlocks"; // B5, overlay

const EDITOR_KEY = "clipper.editorHandoff";

/** "After cutting" settings, kept per campaign beside the other campaign fields. */
function useEditorSettings(campaignId: string | null) {
  const [all, setAll] = useState<Record<string, unknown>>(() =>
    readSetting<Record<string, unknown>>(EDITOR_KEY, {}),
  );
  const settings: EditorHandoffSettings = campaignId
    ? normalizeEditorSettings(all[campaignId])
    : DEFAULT_EDITOR_SETTINGS;
  const setSettings = useCallback(
    (next: EditorHandoffSettings) => {
      if (!campaignId) return;
      setAll((prev) => {
        const merged = { ...prev, [campaignId]: next };
        writeSetting(EDITOR_KEY, merged);
        return merged;
      });
    },
    [campaignId],
  );
  return [settings, setSettings] as const;
}

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

const NO_CHANNEL = { exporting: false, channelUrl: "", cancelExport: () => {} };

/**
 * Channel exporter state. CHANNEL_DATA_BUILT is a compile-time constant, so in a
 * public build the context, hook and their endpoint strings are dropped from the
 * bundle (the branch never changes at run time, so hook order is stable).
 */
function useChannelState() {
  return CHANNEL_DATA_BUILT ? useChannelExportContext() : NO_CHANNEL;
}

function ChannelBoundary({ children }: { children: ReactNode }) {
  return CHANNEL_DATA_BUILT ? <ChannelExportProvider>{children}</ChannelExportProvider> : <>{children}</>;
}

/** Publishes this tab's title and busy state up to the workspace tab strip. */
function TabReporter({ id }: { id: string }) {
  const { info, downloading, exportingComments, loadingInfo, cancelDownload } =
    useClipperContext();
  const { exporting, channelUrl, cancelExport } = useChannelState();
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
    url: sourceUrl,
    info,
    download,
    downloads,
    setStartText,
    setEndText,
    transcript,
    ensureTranscript,
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
  const { playhead, segments: tabSegments, clear: clearSegments } = useSegmentsState();
  const [screen, setScreen] = useState<"workspace" | "channel">("workspace");
  const [helpOpen, setHelpOpen] = useState(false);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A tab with no campaign is offered one, once. Dismissing is remembered for this tab so
  // nobody is nagged: someone who just wants to paste a link and cut once never set a
  // campaign up, and that is a legitimate way to use the app.
  const [campaignPromptDismissed, setCampaignPromptDismissed] = useState(false);

  // Live input for the Copy blocks panel (D-3). The transcript loads on demand, so opening
  // the panel asks for it rather than showing "No transcript loaded" for a video that has one.
  useEffect(() => {
    if (active && copyOpen && videoId) ensureTranscript();
  }, [active, copyOpen, videoId, ensureTranscript]);
  const copyInput = useMemo(
    () =>
      buildCopyBlocksInput({
        sourceUrl,
        videoId,
        transcript,
        segments: tabSegments,
        campaign,
        nextClipId:
          campaign && videoId
            ? nextClipId(videoId, downloads.map((d) => d.label.replace(/\.[^.]+$/, "")))
            : null,
      }),
    [sourceUrl, videoId, transcript, tabSegments, campaign, nextClipId, downloads],
  );

  const ownerAccess = useOwnerAccess();
  const channelAvailable = CHANNEL_DATA_BUILT && ownerAccess;

  const [editorSettings, setEditorSettings] = useEditorSettings(campaign?.id ?? null);
  // Which audio languages the next Clip makes, remembered per campaign. No dubs: one plain clip.
  const [audioSel, setAudioSel] = useAudioLanguageState(campaign?.id ?? null);
  const languagePlans = useMemo(() => planLanguages(info?.audioTracks, audioSel), [info?.audioTracks, audioSel]);
  const languagePlansRef = useRef(languagePlans);
  languagePlansRef.current = languagePlans;
  // Clips cut this session, kept per campaign: the panel's Export / Send all / Copy file path read
  // only the ACTIVE campaign's list, so another client's clips are never offered, or sent.
  const [sessionByCampaign, setSessionByCampaign] = useState<SessionClipsByCampaign<SessionClip>>({});
  const sessionClips = useMemo(
    () => sessionClipsFor(sessionByCampaign, campaign?.id ?? null) as SessionClip[],
    [sessionByCampaign, campaign?.id],
  );
  const editorRef = useRef(editorSettings);
  editorRef.current = editorSettings;

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

  // Once a clip is saved: remember it for the session batch and run the campaign's
  // "After cutting" choice. Never blocks or fails the cut itself.
  // `settings` are the ones in force when the cut STARTED: a switch while it runs must not apply
  // the new campaign's "After cutting" choice to this campaign's clip.
  const afterSaved = useCallback(
    (clipId: string, label: string | undefined, segments: Segment[], settings: EditorHandoffSettings, projectName?: string) => {
      const newest = getDownloads().find((d) => d.kind === "clip");
      if (newest) {
        annotateDownload(newest.id, {
          campaign: campaign?.name,
          campaignId: campaign?.id,
          clipId,
          segments: segments.map((s) => ({ start: s.start, end: s.end })),
          seconds: segments.reduce((sum, s) => sum + (s.end - s.start), 0),
          videoId: videoId ?? undefined,
          videoTitle: info?.title,
          startSec: segments[0]?.start,
        });
      }
      const saved = getDownloads().find((d) => d.kind === "clip" && d.path);
      if (!saved) return; // browser download: no file path to hand on
      const clip: SessionClip = {
        id: clipId,
        label,
        path: saved.path,
        projectName: projectName?.trim() || undefined,
        segments: segments.map((s) => ({ start: s.start, end: s.end })),
        sourceUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl || undefined,
      };
      const cutFor = campaign?.id ?? null;
      setSessionByCampaign((prev) => addSessionClip(prev, cutFor, clip));
      void runAfterCutting(settings, {
        campaignId: cutFor,
        campaignName: campaign?.name,
        sourceTitle: info?.title,
        clipsDir: folders.clipsDir || saveDir || undefined,
        clips: [clip],
      }).catch(() => {});
    },
    [videoId, sourceUrl, campaign?.id, campaign?.name, info?.title, folders.clipsDir, saveDir],
  );

  // Cut: name the clip from the campaign pattern, then record its ranges as used so the
  // no-reuse check and the bank stay in agreement with no bookkeeping.
  const cutClip = useCallback(
    async (segments: Segment[]) => {
      if (!videoId || segments.length === 0) return;
      const cutCampaignId = campaign?.id;
      const startSettings = editorRef.current;
      const taken = downloads.map((d) => d.label.replace(/\.[^.]+$/, ""));
      const clipId = campaign ? nextClipId(videoId, taken) : null;
      // One clip per ticked language: the original keeps the plain name, a dub adds its tag.
      let madeAny = false;
      for (const plan of languagePlansRef.current) {
        const base = clipId ?? (plan.suffix ? info?.title || "clip" : undefined);
        const name = base ? nameForLanguage(base, plan) : undefined;
        const ok = await download({ segments, clipId: name, audioLanguage: plan.language });
        if (!ok) break;
        if (!madeAny && cutCampaignId && clipId) recordUse(videoId, segments, clipId, cutCampaignId);
        madeAny = true;
        afterSaved(name ?? `clip-${Date.now()}`, undefined, segments, startSettings);
      }
      if (!madeAny) return;
      clearSegments();
      setStartText("");
      setEndText("");
    },
    [videoId, campaign, info?.title, downloads, nextClipId, download, recordUse, afterSaved, clearSegments, setStartText, setEndText],
  );

  // Clip bank: cut every segment of a banked clip as ONE file named after the bank id.
  // The column marks it cut and records the used ranges itself once this resolves true.
  const cutBanked = useCallback(
    async (clip: BankedClip, projectName?: string): Promise<boolean> => {
      if (clip.segments.length === 0) return false;
      const startSettings = editorRef.current;
      const baseId = projectName?.trim() || clip.id;
      let madeAny = false;
      for (const plan of languagePlansRef.current) {
        const ok = await download({ segments: clip.segments, clipId: nameForLanguage(baseId, plan), audioLanguage: plan.language });
        if (!ok) break;
        madeAny = true;
        afterSaved(nameForLanguage(clip.id, plan), clip.label, clip.segments, startSettings, projectName);
      }
      return madeAny;
    },
    [download, afterSaved],
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
        setSymbolsOpen((v) => { if (!v) setCopyOpen(false); return !v; });
      } else if (k === "c" && e.shiftKey) {
        e.preventDefault();
        setCopyOpen((v) => { if (!v) setSymbolsOpen(false); return !v; });
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

  const panelHost: PanelHost = {
    playhead,
    cutSegments: (segs) => void cutClip(segs),
    cutBanked,
    editorHandoff: {
      settings: editorSettings,
      onChange: setEditorSettings,
      campaignId: campaign?.id ?? null,
      campaignName: campaign?.name,
      sourceTitle: info?.title,
      clipsDir: folders.clipsDir || saveDir || undefined,
      clips: sessionClips,
    },
  };

  // Overlays that are not panels. They stay one key (and one Panels menu row) away.
  const overlayItems: MenuItem[] = [
    { key: "copy", label: "Copy blocks", onSelect: () => setCopyOpen((v) => { if (!v) setSymbolsOpen(false); return !v; }) },
    { key: "symbols", label: "Symbols", onSelect: () => setSymbolsOpen((v) => { if (!v) setCopyOpen(false); return !v; }) },
    ...(CHANNEL_DATA_BUILT && channelAvailable
      ? [{ key: "channel", label: screen === "channel" ? "Back to workspace" : "Channel data", onSelect: () => setScreen(screen === "channel" ? "workspace" : "channel") } as MenuItem]
      : []),
  ];
  // The campaign menu's "<Campaign> settings" row calls this. The Start, Settings and Help build
  // swaps in its campaign form here; until then the menu falls back to its own inline form.
  const openCampaignSettings: ((campaignId: string) => void) | undefined = undefined;

  return (
    <>
      <OverlayLoader visible={overlayVisible} label="Exporting comments" />
      <main className="flex h-full w-full flex-col overflow-hidden">
        <TopBar
          helpOpen={helpOpen}
          onToggleHelp={() => setHelpOpen((v) => !v)}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
          campaignMenu={<CampaignMenu onOpenSettings={openCampaignSettings} />}
          panelsMenuExtras={overlayItems}
        />
        {!(CHANNEL_DATA_BUILT && screen === "channel") ? (
          <PanelHostProvider value={panelHost}>
            <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
              <PanelWorkspace />
              <HelpDrawer open={helpOpen} onClose={closeHelp} />
            </div>
          </PanelHostProvider>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
                {/* Channel exporter: only in a VITE_ENABLE_CHANNEL_DATA build, on an owner machine. */}
                {channelAvailable && <ChannelExportPanel />}
              </div>
            </div>
            <HelpDrawer open={helpOpen} onClose={closeHelp} />
          </div>
        )}
        <BottomBar
          clipCount={languagePlans.length}
          tracks={info?.audioTracks}
          selectedLanguages={audioSel}
          onSelectLanguages={setAudioSel}
          folder={folders.clipsDir || saveDir || ""}
          onPickFolder={isElectron ? pickClipsDir : undefined}
        />
      </main>
      <CampaignStart
        open={active && !campaign && !campaignPromptDismissed}
        onClose={() => setCampaignPromptDismissed(true)}
        onChosen={() => setCampaignPromptDismissed(true)}
      />
      <SymbolPalette open={symbolsOpen} onClose={closeSymbols} />
      <CopyBlocks open={copyOpen} onClose={closeCopy} input={copyInput} />
      {active && <SavedToast />}
    </>
  );
}

function Shell() {
  const { tabs, activeId, setTabCampaign } = useWorkspace();
  const connection = useYouTubeConnection();

  // No background polling. On launch we read the imported cookies.txt once
  // and verify it silently; after that the user checks when they choose.
  useEffect(() => {
    void restoreConnection();
  }, []);

  return (
    <div className="surface-ground flex h-screen w-full flex-col overflow-hidden">
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
                <ChannelBoundary>
                  <TabActiveProvider active={active} tabId={tab.id}>
                    <TabReporter id={tab.id} />
                    {/* Each tab keeps its own campaign, so changing it here leaves the others alone. */}
                    <CampaignTabScope
                      campaignId={tab.campaignId}
                      onChange={(cid) => setTabCampaign(tab.id, cid)}
                    >
                      <Layout active={active} />
                    </CampaignTabScope>
                  </TabActiveProvider>
                </ChannelBoundary>
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
    <ErrorBoundary>
      <WorkspaceProvider>
        <CampaignProvider>
          <Shell />
        </CampaignProvider>
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
