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
import { useFlushPendingReports } from "../features/help/hooks/useReportMutations";
import { loadLastLayout } from "../shared/utils/lastLayout";
import { CRASHED_ERROR, wasCrashed } from "../features/help/utils/crashDetails";
import { runLaunchSignIn } from "../shared/utils/launchSignIn";
import CrashScreenHost from "../features/help/components/CrashScreenHost";
import ErrorBoundary from "../shared/components/ErrorBoundary";
import ChannelDataDrawer from "../features/channelExport/components/ChannelDataDrawer";
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
import { bankStore, clipsFor, type BankedClip } from "../shared/utils/bank";
import { clipNameFor } from "../features/clips/utils/cutNaming";
import { matchingMoment } from "../features/clips/utils/finishBankedCut";
import { extraSecondsFor, padSections } from "../features/clips/utils/padSections";
import { getNextClipName } from "../modules/layout/hooks/useNextClipName";
import { usePanelLayoutState } from "../modules/layout/hooks/usePanelLayoutState";
import { tabDomId } from "../modules/layout/components/PanelTabStrip";
import { setMakingName } from "../shared/utils/clipNameStore";
import OverlayLoader from "../shared/components/OverlayLoader";
import DragOutHandle from "../shared/components/DragOutHandle";
import { useSegmentsState } from "../shared/hooks/useSegmentsState";
import type { Segment } from "../shared/utils/segments";
import {
  restoreConnection,
  sweepBrowsers,
  useYouTubeConnection,
} from "../shared/utils/youtubeConnection";
// Shell
import TopBar from "../modules/layout/components/TopBar";
import BottomBar from "../modules/layout/components/BottomBar";
import { useSignInSignalEffects } from "../modules/layout/hooks/useSignInSignalEffects";
import SettingsRestoredNote from "../features/settings/components/SettingsRestoredNote";
import TipCard from "../features/tips/components/TipCard";
import { useTipsController } from "../features/tips/hooks/useTipsController";
import ImportDrawer from "../features/import/components/ImportDrawer";
import { usePasteRoutingEffects } from "../modules/layout/hooks/usePasteRoutingEffects";
import { isLikelyChannelUrl } from "../features/channelExport/utils/channel";
import { useAudioLanguageState } from "../modules/layout/hooks/useAudioLanguageState";
import { nameForLanguage, planLanguages } from "../shared/utils/audioLanguages";
import type { MenuItem } from "../modules/layout/components/PopoverMenu";
import PanelWorkspace from "../modules/layout/components/PanelWorkspace";
import PanelsMenu from "../modules/layout/components/PanelsMenu";
import { PanelHostProvider, type PanelHost } from "../modules/layout/hooks/PanelHostContext";
import { getClipDestination } from "../features/player/hooks/useClipDestination";
import { settingsWithDestination } from "../features/player/utils/clipDestination";
// Phase B mount points. Replace the files, never this wiring.
import CampaignMenu from "../features/campaigns/components/CampaignMenu";
import HelpDrawer from "../features/help/components/HelpDrawer"; // B6, right drawer
import { useDayHost } from "../features/workspace/hooks/useDayHost";
import SymbolsDialog from "../features/symbols/components/SymbolsDialog"; // browser fallback of the Symbols window
import CampaignStart from "../features/campaigns/components/CampaignStart";
import SettingsDrawer from "../features/settings/components/SettingsDrawer";
import ColdStartScreen from "../features/start/components/ColdStartScreen";

/** Where clips go is chosen in the Clip arrow menu only; it decides what happens after a clip is saved. */
function withDestination(settings: EditorHandoffSettings): EditorHandoffSettings {
  return settingsWithDestination(settings, getClipDestination());
}

const EDITOR_KEY = "clipper.editorHandoff";

/** "After cutting" settings, kept per campaign beside the other campaign fields. */
/** A campaign with no Final Cut settings yet starts with the layout picked last, the way a new campaign gets the last look. */
function editorSettingsOf(raw: unknown): EditorHandoffSettings {
  const settings = normalizeEditorSettings(raw);
  return raw === undefined ? { ...settings, layout: loadLastLayout() ?? settings.layout } : settings;
}

function useEditorSettings(campaignId: string | null) {
  const [all, setAll] = useState<Record<string, unknown>>(() =>
    readSetting<Record<string, unknown>>(EDITOR_KEY, {}),
  );
  const settings: EditorHandoffSettings = campaignId
    ? editorSettingsOf(all[campaignId])
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
  // Any campaign's settings, for the Settings drawer (every campaign's Final Cut fields show there).
  const settingsFor = useCallback((id: string) => editorSettingsOf(all[id]), [all]);
  const setSettingsFor = useCallback((id: string, next: EditorHandoffSettings) => {
    setAll((prev) => {
      const merged = { ...prev, [id]: next };
      writeSetting(EDITOR_KEY, merged);
      return merged;
    });
  }, []);
  return [settings, setSettings, settingsFor, setSettingsFor] as const;
}

/** True when a saved clip's detail says it came out at 360p (the toast then offers the sign-in). */
export function lowQualityDetail(detail: string | undefined): boolean {
  return /at 360p\b/.test(detail ?? "");
}

function SavedToast({ onSignIn }: { onSignIn?: () => void }) {
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
          {onSignIn && lowQualityDetail(savedNotice.detail) && (
            <button type="button" onClick={onSignIn} className="btn ml-1 shrink-0">
              Sign in for 1080p
            </button>
          )}
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

const NO_CHANNEL = { exporting: false, channelUrl: "", cancelExport: () => {}, setChannelUrl: (_url: string) => {} };

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
    duration,
    setStartText,
    setEndText,
    setUrl,
    flushAutoLoad,
    transcript,
    ensureTranscript,
  } = useClipperContext();
  const {
    active: campaign,
    folders,
    update,
    recordUse,
    pickClipsDir,
    pickDataDir,
  } = useCampaign();
  const { playhead, segments: tabSegments, clear: clearSegments } = useSegmentsState();
  const lowQuality = useSignInSignalEffects();
  const [channelOpen, setChannelOpen] = useState(false);
  const channel = useChannelState();
  const [helpOpen, setHelpOpen] = useState(false);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Tips never open beside the first-run campaign prompt: they wait for a campaign (or for the prompt to be dismissed).
  // Only the open video shows tips; a hidden video must not run the timer or point at its own controls.
  const [campaignPromptDismissed, setCampaignPromptDismissed] = useState(false);
  const tips = useTipsController(!!info && active && (!!campaign || campaignPromptDismissed));
  const [importText, setImportText] = useState<string | null>(null);
  // The footer's "Sign in for 1080p" opens Help on its sign-in page.
  const [helpStartAt, setHelpStartAt] = useState<"signin" | null>(null);
  // "<Campaign> settings" in the campaign menu opens the drawer on that campaign.
  const [settingsStartAt, setSettingsStartAt] = useState<string | null>(null);
  // A tab with no campaign is offered one, once. Dismissing is remembered for this tab so
  // nobody is nagged: someone who just wants to paste a link and cut once never set a
  // campaign up, and that is a legitimate way to use the app.


  const ownerAccess = useOwnerAccess();
  const channelAvailable = CHANNEL_DATA_BUILT && ownerAccess;

  const [editorSettings, setEditorSettings, editorSettingsFor, setEditorSettingsFor] = useEditorSettings(campaign?.id ?? null);
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

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    setHelpStartAt(null);
  }, []);
  const closeSymbols = useCallback(() => setSymbolsOpen(false), []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsStartAt(null);
  }, []);

  // Switching campaign re-points the saving folder. The clips
  // folder lives on the campaign; the clipper still saves to its own saveDir, so mirror it.
  useEffect(() => {
    if (isElectron && folders.clipsDir && folders.clipsDir !== saveDir) {
      setSaveDir(folders.clipsDir);
    }
  }, [isElectron, folders.clipsDir, saveDir, setSaveDir]);

  const campaignId = campaign?.id ?? null;

  // Once a clip is saved: remember it for the session batch and run the campaign's
  // "After cutting" choice. Never blocks or fails the cut itself.
  // `settings` are the ones in force when the cut STARTED: a switch while it runs must not apply
  // the new campaign's "After cutting" choice to this campaign's clip.
  const afterSaved = useCallback(
    (clipId: string, label: string | undefined, segments: Segment[], settings: EditorHandoffSettings, projectName?: string, groupId?: string) => {
      const newest = getDownloads().find((d) => d.kind === "clip");
      if (newest) {
        annotateDownload(newest.id, {
          campaign: campaign?.name,
          campaignId: campaign?.id,
          // A clip and its language copies share one id, so Undo takes them all (the session clip
          // keeps the per-language id).
          clipId: groupId ?? clipId,
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
        sourceTitle: info?.title || undefined,
        cutAt: Date.now(),
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

  // Cut: the clip's name (typed on the lane, else suggested) is the file's name, the row's name and
  // the editor project's name. Marked sections get the campaign's extra seconds at both ends; the
  // ranges recorded as used are the marked ones. A range that is a waiting moment marks it cut.
  const cutClip = useCallback(
    async (segments: Segment[]) => {
      if (!videoId || segments.length === 0) return;
      const cutCampaignId = campaign?.id;
      const startSettings = withDestination(editorRef.current);
      const taken = downloads.map((d) => d.label.replace(/\.[^.]+$/, ""));
      const name = clipNameFor({ candidates: [getNextClipName()], videoTitle: info?.title, taken });
      const toCut = padSections(segments, extraSecondsFor(cutCampaignId), duration || undefined);
      setMakingName(name);
      // One clip per ticked language: the original keeps the plain name, a dub adds its tag.
      let madeAny = false;
      try {
        for (const plan of languagePlansRef.current) {
          const fileName = nameForLanguage(name, plan);
          const ok = await download({ segments: toCut, clipId: fileName, audioLanguage: plan.language });
          if (!ok) break;
          if (!madeAny && cutCampaignId) {
            recordUse(videoId, segments, name, cutCampaignId);
            const moment = matchingMoment(clipsFor(bankStore.get(), cutCampaignId, videoId), segments);
            if (moment) bankStore.markCut(cutCampaignId, videoId, moment.id);
          }
          madeAny = true;
          afterSaved(fileName, undefined, segments, startSettings, undefined, name);
        }
      } finally {
        setMakingName(null);
      }
      if (!madeAny) return;
      clearSegments();
      setStartText("");
      setEndText("");
    },
    [videoId, campaign, info?.title, downloads, duration, download, recordUse, afterSaved, clearSegments, setStartText, setEndText],
  );

  // Clip bank: cut every segment of a banked clip as ONE file named after the bank id.
  // The column marks it cut and records the used ranges itself once this resolves true.
  const cutBanked = useCallback(
    async (clip: BankedClip, projectName?: string): Promise<boolean> => {
      if (clip.segments.length === 0) return false;
      const startSettings = withDestination(editorRef.current);
      const baseId = projectName?.trim() || clip.id;
      let madeAny = false;
      for (const plan of languagePlansRef.current) {
        const ok = await download({ segments: clip.segments, clipId: nameForLanguage(baseId, plan), audioLanguage: plan.language });
        if (!ok) break;
        madeAny = true;
        afterSaved(nameForLanguage(clip.id, plan), clip.label, clip.segments, startSettings, projectName, clip.id);
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
        setSymbolsOpen((v) => !v);
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

  const settingsDrawer = (
    <SettingsDrawer
      open={settingsOpen}
      onClose={closeSettings}
      startAt={settingsStartAt}
      videoTitle={info?.title}
      tracks={info?.audioTracks}
      editor={{ settingsFor: editorSettingsFor, onChange: setEditorSettingsFor }}
    />
  );
  const dayHost = useDayHost();
  // The end card's buttons: show the panel (open and brought forward) and put the keyboard on its tab.
  const { open: openPanelById } = usePanelLayoutState();
  const focusPanel = (id: "export" | "videos") => {
    openPanelById(id);
    window.setTimeout(() => document.getElementById(tabDomId(id))?.focus(), 0);
  };
  const panelHost: PanelHost = {
    playhead,
    cutSegments: (segs) => void cutClip(segs),
    cutBanked,
    openSymbols: () => setSymbolsOpen(true),
    openImport: (text) => setImportText(text ?? ""),
    addMoment: () => {
      if (!campaign?.id || !videoId || tabSegments.length === 0) return;
      bankStore.importClips(campaign.id, videoId, [{ line: 1, id: null, label: "", segments: tabSegments.map((x) => ({ start: x.start, end: x.end })) }]);
    },
    openChannel: (url) => {
      if (url) channel.setChannelUrl(url);
      setChannelOpen(true);
    },
    editorHandoff: {
      settings: editorSettings,
      onChange: setEditorSettings,
      campaignId: campaign?.id ?? null,
      campaignName: campaign?.name,
      sourceTitle: info?.title,
      clipsDir: folders.clipsDir || saveDir || undefined,
      clips: sessionClips,
    },
    // Not wired yet: the videos list (Left panels) provides the next video, and the campaign form
    // (Settings) provides the daily quota. Until then the end card says "Nothing waiting".
    day: dayHost.day,
    onNextVideo: dayHost.onNextVideo,
    onOpenBank: () => focusPanel("export"),
    onOpenVideo: () => focusPanel("videos"),
  };

  // Overlays that are not panels. They stay one key (and one Panels menu row) away.
  const overlayItems: MenuItem[] = [
    ...(CHANNEL_DATA_BUILT && channelAvailable
      ? [{ key: "channel", label: "Channel data", onSelect: () => setChannelOpen((v) => !v) } as MenuItem]
      : []),
  ];
  // The campaign menu's "<Campaign> settings" row calls this. The Start, Settings and Help build
  // swaps in its campaign form here; until then the menu falls back to its own inline form.
  // One global paste handler: a video link opens it, rows with times and a channel link go to the
  // Import and Channel data surfaces (wired by the Start, Settings and Help build).
  usePasteRoutingEffects(
    active,
    {
      onVideo: (link) => {
        setUrl(link);
        flushAutoLoad();
      },
      onMoments: (text) => setImportText(text),
      onChannel: (url) => {
        channel.setChannelUrl(url);
        setChannelOpen(true);
      },
    },
    { isChannelUrl: CHANNEL_DATA_BUILT && channelAvailable ? isLikelyChannelUrl : undefined },
  );
  const openCampaignSettings = (campaignId: string) => {
    setSettingsStartAt(campaignId);
    setHelpOpen(false);
    setSettingsOpen(true);
  };

  // The footer pill and the "Downloaded at 360p" toast both open Help on its sign-in page.
  const openSignIn = () => {
    setHelpStartAt("signin");
    setSettingsOpen(false);
    setHelpOpen(true);
  };

  return (
    <>
      <SettingsRestoredNote />
      <OverlayLoader visible={overlayVisible} label="Exporting comments" />
      <main className="flex h-full w-full flex-col overflow-hidden">
        {/* No video open: the cold start screen is the whole window. It replaces the old URL bar. */}
        {!info ? (
          <ColdStartScreen />
        ) : (
        <>
        {/* Only the open video mounts the top bar, drawers, tip card and bottom bar, so there is one Help button,
            one Settings button and one tip on screen however many videos are open. */}
        {active && (
        <TopBar
          helpOpen={helpOpen}
          onToggleHelp={() => {
            setHelpStartAt(null);
            setSettingsOpen(false);
            setHelpOpen((v) => !v);
          }}
          settingsOpen={settingsOpen}
          onToggleSettings={() => {
            setSettingsStartAt(null);
            setHelpOpen(false);
            setSettingsOpen((v) => !v);
          }}
          panelsMenuExtras={overlayItems}
          campaignMenu={<CampaignMenu onOpenSettings={openCampaignSettings} />}
        />
        )}
        <PanelHostProvider value={panelHost}>
          <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
            <PanelWorkspace />
            {active && (
              <>
                <HelpDrawer open={helpOpen} onClose={closeHelp} startAt={helpStartAt} tips={{ on: tips.on, onReplay: tips.replay }} />
                {settingsDrawer}
                <ImportDrawer text={importText} onClose={() => setImportText(null)} />
                {CHANNEL_DATA_BUILT && channelAvailable && <ChannelDataDrawer open={channelOpen} onClose={() => setChannelOpen(false)} />}
                {tips.card && importText === null && !helpOpen && <TipCard {...tips.card} />}
              </>
            )}
          </div>
        </PanelHostProvider>
        {active && (
        <BottomBar
          clipCount={languagePlans.length}
          tracks={info?.audioTracks}
          selectedLanguages={audioSel}
          onSelectLanguages={setAudioSel}
          folder={folders.clipsDir || saveDir || ""}
          onPickFolder={isElectron ? pickClipsDir : undefined}
          at360={lowQuality}
          showSignInPill={lowQuality}
          // The Help sidebar's sign-in page (Start, Settings and Help build) opens from here.
          onSignIn={openSignIn}
        />
        )}
        </>
        )}
      </main>
      <CampaignStart
        open={active && !!info && !campaign && !campaignPromptDismissed}
        onClose={() => setCampaignPromptDismissed(true)}
        onChosen={() => setCampaignPromptDismissed(true)}
      />
      <SymbolsDialog open={symbolsOpen} onClose={closeSymbols} />
      {active && <SavedToast onSignIn={openSignIn} />}
    </>
  );
}

function Shell() {
  useFlushPendingReports();
  const { tabs, activeId, setTabCampaign } = useWorkspace();

  // No background polling. On launch we read the imported cookies.txt once and verify it silently; if that gives
  // no session we quietly try the browsers' own YouTube sign-in, and report the result so the footer pill is right.
  useEffect(() => {
    void runLaunchSignIn({
      restore: restoreConnection,
      sweep: sweepBrowsers,
      report: (usable) => window.electronAPI?.reportBrowserSignIn?.(usable),
    });
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
    </div>
  );
}

export default function App() {
  // The window was reloaded by the main process after its page process died: show the crash screen.
  if (wasCrashed(window.location.search)) return <CrashScreenHost error={new Error(CRASHED_ERROR)} />;
  return (
    <ErrorBoundary fallback={(error) => <CrashScreenHost error={error} />}>
      <WorkspaceProvider>
        <CampaignProvider>
          <Shell />
        </CampaignProvider>
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
