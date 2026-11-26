/**
 * File: SettingsDrawer.tsx
 * Path: src/renderer/src/features/settings/components/SettingsDrawer.tsx
 * Description: The 440px Settings drawer on the right (Settings.dc.html 04.6). It sits over the Export
 *   panel while open and blocks nothing else. Rows with a chevron open a second view, switches flip in
 *   place, Back shows the parent's name, X and Escape close.
 */
import { updatesInPlace } from "../../../../../common/types/updates";
import { useEffect, useRef, useState } from "react";
import { useDrawerFocus } from "../../../shared/hooks/useDrawerFocus";
import { Drawer } from "../../../shared/components/Drawer";
import CampaignForm from "../../campaigns/components/CampaignForm";
import SettingsCampaign from "./SettingsCampaign";
import SettingsEditor, { type FinalCutFields } from "./SettingsEditor";
import SettingsSignIn from "./SettingsSignIn";
import SettingsLocation from "./SettingsLocation";
import SettingsNewLocation, { locationFolderName } from "./SettingsNewLocation";
import { useCookieDropMutations } from "../hooks/useCookieDropMutations";
import { useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { signInRowValue, type SignInStatus } from "../utils/signInStatus";
import SettingsTopList from "./SettingsTopList";
import { useSettingsController } from "../hooks/useSettingsController";
import { useFinalCutLayout } from "../hooks/useFinalCutLayout";
import { useFinalCutLook } from "../hooks/useFinalCutLook";
import { useClipDestination } from "../../player/hooks/useClipDestination";
import { campaignClipsDir, campaignNameProblems, type Campaign } from "../../../shared/utils/campaigns";
import { FOLDER_NOT_MADE_YET, folderChipLabel } from "../../../shared/utils/folderLabel";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { lookForCampaign, loadSavedLooks } from "../../../shared/utils/fcpLooks";
import { useAudioLanguageState } from "../../../modules/layout/hooks/useAudioLanguageState";
import { audioButtonLabel, hasDubTracks, toggleLanguage as toggleAudioLanguage } from "../../../shared/utils/audioLanguages";
import { destinationLabel } from "../../player/utils/clipDestination";
import { markSeen, type SetupSeen } from "../utils/editorSetup";
import { editorSummary, finalCutSummary, hasEditorPage } from "../utils/editorSummary";
import { DEFAULT_DAILY_QUOTA, dropCampaignPrefs, toggleLanguage } from "../utils/settingsPrefs";
import type { AudioTrack } from "../../../shared/utils/clip";
import type { EditorHandoffSettings } from "../../../shared/utils/fcpxml";

/** How long "Click again to delete" stays armed. */
export const DELETE_ARM_MS = 5000;
/** A second click this soon after the first is the same double-click, not a decision. */
export const DELETE_GUARD_MS = 400;

export type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Campaign to land on, from "<Campaign> settings" in the campaign menu. */
  startAt: string | null;
  /** Audio tracks of the open video; its dubs become the language chips. */
  tracks?: AudioTrack[];
  /** Title of the open video, used as the sample in the layout preview. */
  videoTitle?: string;
  /** Any campaign's Final Cut settings, and writing them. */
  editor: { settingsFor: (campaignId: string) => EditorHandoffSettings; onChange: (campaignId: string, s: EditorHandoffSettings) => void };
};

export default function SettingsDrawer({ open, onClose, startAt, tracks, editor, videoTitle }: SettingsDrawerProps) {
  const c = useSettingsController({ open, onClose, startAt });
  const cookies = useCookieDropMutations();
  const connection = useYouTubeConnection();
  const signInStatus: SignInStatus | null = cookies.status ?? (connection.connected ? { state: "signed-in", justChecked: false } : null);
  const [chosen] = useClipDestination();
  // Liam, 25 Nov: a campaign's export settings are always here. With no editor chosen yet (or CapCut, which has
  // nothing to set) the page is Final Cut Pro's, the first editor, so its library, event, layout and look are never out of reach.
  const destination = hasEditorPage(chosen) ? chosen : "finalcut";
  const viewId = c.view.kind === "campaign" || c.view.kind === "editor" ? c.view.id : null;
  const activeCampaign = c.campaigns.campaigns.find((x) => x.id === viewId);
  // A location's own Languages row is the same remembered choice the Clip menu's Audio page makes, per location.
  const [langSel, setLangSel] = useAudioLanguageState(activeCampaign?.id ?? null);
  const activeFcp = activeCampaign ? editor.settingsFor(activeCampaign.id) : undefined;
  const look = useFinalCutLook(activeCampaign, c.campaigns, () => {
    if (activeCampaign && activeFcp) editor.onChange(activeCampaign.id, { ...activeFcp, timelineFormat: { ...activeFcp.timelineFormat, kind: "look" } });
  });
  const layout = useFinalCutLayout(
    activeCampaign,
    {
      layout: activeFcp?.layout ?? "export",
      onLayout: (id) => activeCampaign && activeFcp && editor.onChange(activeCampaign.id, { ...activeFcp, layout: id }),
    },
    { library: activeFcp ? folderChipLabel(activeFcp.fcpLibrary ?? "", 1) : "", event: activeFcp?.mediaEvent ?? "", videoTitle },
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const armedAt = useRef(0);
  const root = useRef<HTMLDivElement | null>(null);
  // A3-3: Tab stays in the drawer, Esc or Close returns focus to the Settings button, and a new view lands on its heading.
  const onKeyDown = useDrawerFocus(root, open, c.view.kind === "campaign" || c.view.kind === "editor" ? `${c.view.kind}:${c.view.id}` : c.view.kind, "#ui-settings");
  // Opening lands on the drawer's heading too, so the keyboard does not start behind it.
  useEffect(() => {
    if (!open) return;
    const h = root.current?.querySelector<HTMLElement>("h3");
    if (h) {
      h.tabIndex = -1;
      h.focus();
    }
  }, [open]);
  // A-7: the first click on Delete arms it for a few seconds only; leaving the view or closing the drawer disarms it.
  const viewKey = c.view.kind === "campaign" ? c.view.id : c.view.kind === "editor" ? `editor:${c.view.id}` : c.view.kind;
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), DELETE_ARM_MS);
    return () => window.clearTimeout(t);
  }, [confirming]);
  useEffect(() => setConfirming(null), [viewKey, open]);
  if (!open) return null;
  const { view } = c;
  const campaign = view.kind === "campaign" || view.kind === "editor" ? c.campaigns.campaigns.find((x) => x.id === view.id) : undefined;

  const lookFormat = (campaign: Campaign) => lookForCampaign(campaign, loadSavedLooks())?.format ?? null;
  const fcpFields = (campaign: Campaign, fcp: EditorHandoffSettings): FinalCutFields => ({
    library: fcp.fcpLibrary ? (fcp.fcpLibrary.split(/[\\/]/).pop() ?? "") : "",
    // Blank means "Export" (shown as the placeholder). Layouts video and day name their own events.
    event: fcp.mediaEvent,
    showEvent: fcp.layout === "export" || fcp.layout === "flat",
    onChoose: () => {
      void window.electronAPI?.pickFcpLibrary?.().then((p) => {
        if (p) editor.onChange(campaign.id, { ...fcp, fcpLibrary: p });
      });
    },
    onEvent: (v) => editor.onChange(campaign.id, { ...fcp, mediaEvent: v }),
    look,
    layout,
    timeline: {
      kind: fcp.timelineFormat.kind,
      custom: { width: fcp.timelineFormat.width, height: fcp.timelineFormat.height, fps: fcp.timelineFormat.fps },
      lookName: look?.saved.find((l) => l.id === look.currentId)?.name ?? "",
      lookFormat: lookFormat(campaign),
      onPick: (kind) => editor.onChange(campaign.id, { ...fcp, timelineFormat: { ...fcp.timelineFormat, kind, fps: "source" } }),
    },
  });

  let body;
  if (view.kind === "editor" && campaign && hasEditorPage(destination)) {
    body = (
      <SettingsEditor
        campaignName={campaign.name}
        label={destinationLabel(destination)}
        finalCut={destination === "finalcut" ? fcpFields(campaign, editor.settingsFor(campaign.id)) : null}
        onBack={c.back}
        onClose={onClose}
        onSkip={
          c.fromPick && destination === "finalcut"
            ? () => {
                writeSetting("clipper.editorSetupSeen", markSeen(readSetting<SetupSeen>("clipper.editorSetupSeen", {}), campaign.id, destination));
                onClose();
              }
            : undefined
        }
      />
    );
  } else if (view.kind === "newLocation") {
    body = (
      <SettingsNewLocation
        defaultFolder={(name) => folderChipLabel(campaignClipsDir({ name, clipsDir: "", kind: "location" }, c.campaigns.defaultFolders.clipsDir), 2)}
        onChoose={async (name) => (await window.electronAPI?.pickBrandedDirectory?.({ kind: "location", name }))?.dir ?? null}
        onAdd={(input) => {
          const found = campaignNameProblems(input.name, c.campaigns.campaigns);
          if (found.length) return found;
          c.campaigns.create({ name: input.name, kind: "location", soundOnly: input.soundOnly, ...(input.clipsDir ? { clipsDir: input.clipsDir } : {}) });
          c.setView({ kind: "top" });
          return [];
        }}
        onBack={c.back}
        onClose={onClose}
      />
    );
  } else if (view.kind === "campaign" && campaign?.kind === "location") {
    body = (
      <SettingsLocation
        name={campaign.name}
        folderLabel={folderChipLabel(campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir), 2)}
        languages={
          hasDubTracks(tracks)
            ? {
                summary: audioButtonLabel(tracks, langSel),
                items: tracks.map((t) => ({
                  code: t.language,
                  label: t.kind === "original" ? "Original" : t.label,
                  ticked: t.kind === "original" ? !(langSel ?? []).includes(`-${t.language}`) : (langSel ?? []).includes(t.language),
                })),
                onToggle: (code) => setLangSel(toggleAudioLanguage(tracks, langSel, code)),
              }
            : undefined
        }
        soundOnly={campaign.soundOnly === true}
        onSoundOnly={(on) => c.campaigns.update(campaign.id, { soundOnly: on })}
        onChangeFolder={() => c.campaigns.pickClipsDir(campaign.id)}
        onRename={(next) => {
          const found = campaignNameProblems(next, c.campaigns.campaigns, campaign.id);
          if (found.length) return found;
          // Pin the current folder: renaming must not orphan the clips already there.
          const pinned = campaign.clipsDir || campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir);
          c.campaigns.update(campaign.id, { name: next.trim(), ...(pinned ? { clipsDir: pinned } : {}) });
          return [];
        }}
        confirmingDelete={confirming === campaign.id}
        onDelete={() => {
          if (confirming === campaign.id) {
            if (Date.now() - armedAt.current < DELETE_GUARD_MS) return;
            setConfirming(null);
            c.campaigns.remove(campaign.id);
            dropCampaignPrefs(campaign.id, (k) => readSetting<Record<string, unknown>>(k, {}), writeSetting);
          } else {
            armedAt.current = Date.now();
            setConfirming(campaign.id);
          }
        }}
        onBack={c.back}
        onClose={onClose}
      />
    );
  } else if (view.kind === "campaign" && campaign) {
    const fcp = editor.settingsFor(campaign.id);
    body = (
      <SettingsCampaign
        name={campaign.name}
        prefs={c.prefsFor(campaign.id)}
        dubs={(tracks ?? []).filter((t) => t.kind !== "original").map((t) => ({ code: t.language, label: t.label }))}
        quota={campaign.dailyQuota ?? DEFAULT_DAILY_QUOTA}
        onQuota={(n) => c.campaigns.update(campaign.id, { dailyQuota: n })}
        folderLabel={folderChipLabel(campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir), 3)}
        editor={
          hasEditorPage(destination)
            ? {
                label: destinationLabel(destination),
                summary: editorSummary(
                  destination,
                  destinationLabel(destination),
                  finalCutSummary({
                    library: fcp.fcpLibrary ? folderChipLabel(fcp.fcpLibrary, 1) : "",
                    event: fcp.mediaEvent,
                    layout: fcp.layout ?? "export",
                    look: look?.saved.find((l) => l.id === look.currentId)?.name ?? "",
                  }),
                ),
                onOpen: () => c.setView({ kind: "editor", id: campaign.id }),
              }
            : null
        }
        lengthRule={{ min: campaign.lengthMinSec, max: campaign.lengthMaxSec }}
        onLengthRule={(patch) => c.campaigns.update(campaign.id, patch)}
        onPatch={(patch) => c.patchCampaign(campaign.id, patch)}
        onToggleLanguage={(code) => c.patchCampaign(campaign.id, { languages: toggleLanguage(c.prefsFor(campaign.id).languages, code) })}
        onOpenFolder={async () => {
          const dir = campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir);
          if (!dir) return null;
          const r = await window.electronAPI?.showInFolder(dir);
          return r?.missing ? FOLDER_NOT_MADE_YET : null;
        }}
        folderChosen={Boolean(campaign.clipsDir)}
        onChangeFolder={() => c.campaigns.pickClipsDir(campaign.id)}
        onRename={(next) => {
          const found = campaignNameProblems(next, c.campaigns.campaigns, campaign.id);
          if (found.length) return found;
          // The folder follows the name unless the campaign has its own, so pin the current one: renaming must not orphan its clips.
          const pinned = campaign.clipsDir || campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir);
          c.campaigns.update(campaign.id, { name: next.trim(), ...(pinned ? { clipsDir: pinned } : {}) });
          return [];
        }}
        confirmingDelete={confirming === campaign.id}
        onDelete={() => {
          if (confirming === campaign.id) {
            if (Date.now() - armedAt.current < DELETE_GUARD_MS) return;
            setConfirming(null);
            c.campaigns.remove(campaign.id);
            dropCampaignPrefs(campaign.id, (k) => readSetting<Record<string, unknown>>(k, {}), writeSetting);
          } else {
            armedAt.current = Date.now();
            setConfirming(campaign.id);
          }
        }}
        onBack={c.back}
        onClose={onClose}
      />
    );
  } else if (view.kind === "signin") {
    body = (
      <SettingsSignIn
        status={signInStatus}
        onSignOut={() => void cookies.signOut()}
        onFile={(f) => void cookies.onFile(f)}
        onChoose={() => void cookies.choose()}
        onBack={c.back}
        onClose={onClose}
      />
    );
  } else {
    body = (
      <SettingsTopList
        rows={c.rows}
        onEdit={(id) => c.setView({ kind: "campaign", id })}
        onAdd={() => c.setAdding(true)}
        onAddLocation={() => c.setView({ kind: "newLocation" })}
        locationFolder={locationFolderName}
        app={c.app}
        autoUpdate={c.autoUpdate}
        autoUpdateAvailable={updatesInPlace(typeof navigator === "undefined" ? "" : navigator.platform)}
        onAutoUpdate={c.setAutoUpdate}
        onPatchApp={c.patchApp}
        signInValue={signInRowValue(cookies.status, connection.connected)}
        onOpenSignIn={() => c.setView({ kind: "signin" })}
        onClose={onClose}
      />
    );
  }

  return (
    <div id="ui-settings-drawer" ref={root} onKeyDown={onKeyDown} className="absolute inset-y-0 right-0 z-30 max-w-full overflow-y-auto">
      <Drawer label="Settings">{body}</Drawer>
      <CampaignForm
        open={c.adding}
        onClose={() => c.setAdding(false)}
        onCreated={(made) => {
          c.setAdding(false);
          c.setView({ kind: "campaign", id: made.id });
        }}
      />
    </div>
  );
}
