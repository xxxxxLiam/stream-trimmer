/**
 * File: SettingsDrawer.tsx
 * Path: src/renderer/src/features/settings/components/SettingsDrawer.tsx
 * Description: The 440px Settings drawer on the right (Settings.dc.html 04.6). It sits over the Export
 *   panel while open and blocks nothing else. Rows with a chevron open a second view, switches flip in
 *   place, Back shows the parent's name, X and Escape close.
 */
import { useEffect, useRef, useState } from "react";
import { Drawer } from "../../../shared/components/Drawer";
import CampaignForm from "../../campaigns/components/CampaignForm";
import SettingsCampaign from "./SettingsCampaign";
import SettingsCampaigns from "./SettingsCampaigns";
import SettingsFolder from "./SettingsFolder";
import SettingsTopList from "./SettingsTopList";
import { useSettingsController } from "../hooks/useSettingsController";
import { useFinalCutLayout } from "../hooks/useFinalCutLayout";
import { useFinalCutLook } from "../hooks/useFinalCutLook";
import { useClipDestination } from "../../player/hooks/useClipDestination";
import { campaignClipsDir, campaignNameProblems } from "../../../shared/utils/campaigns";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
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
  const [destination] = useClipDestination();
  const viewId = c.view.kind === "campaign" ? c.view.id : null;
  const activeCampaign = c.campaigns.campaigns.find((x) => x.id === viewId);
  const look = useFinalCutLook(activeCampaign, c.campaigns);
  const activeFcp = activeCampaign ? editor.settingsFor(activeCampaign.id) : undefined;
  const layout = useFinalCutLayout(
    activeCampaign,
    {
      layout: activeFcp?.layout ?? "export",
      onLayout: (id) => activeCampaign && activeFcp && editor.onChange(activeCampaign.id, { ...activeFcp, layout: id }),
    },
    { library: activeFcp ? folderChipLabel(activeFcp.fcpLibrary ?? "", 1) : "", event: activeFcp?.mediaEvent ?? "", videoTitle },
  );
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const armedAt = useRef(0);
  // A-7: the first click on Delete arms it for a few seconds only; leaving the view or closing the drawer disarms it.
  const viewKey = c.view.kind === "campaign" ? c.view.id : c.view.kind;
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), DELETE_ARM_MS);
    return () => window.clearTimeout(t);
  }, [confirming]);
  useEffect(() => setConfirming(null), [viewKey, open]);
  if (!open) return null;
  const { view } = c;
  const campaign = view.kind === "campaign" ? c.campaigns.campaigns.find((x) => x.id === view.id) : undefined;

  let body;
  if (view.kind === "campaign" && campaign) {
    const fcp = editor.settingsFor(campaign.id);
    body = (
      <SettingsCampaign
        name={campaign.name}
        prefs={c.prefsFor(campaign.id)}
        dubs={(tracks ?? []).filter((t) => t.kind !== "original").map((t) => ({ code: t.language, label: t.label }))}
        quota={campaign.dailyQuota ?? DEFAULT_DAILY_QUOTA}
        onQuota={(n) => c.campaigns.update(campaign.id, { dailyQuota: n })}
        folderLabel={folderChipLabel(campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir), 3)}
        finalCut={
          destination === "finalcut"
            ? {
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
              }
            : null
        }
        onPatch={(patch) => c.patchCampaign(campaign.id, patch)}
        onToggleLanguage={(code) => c.patchCampaign(campaign.id, { languages: toggleLanguage(c.prefsFor(campaign.id).languages, code) })}
        onOpenFolder={() => {
          const dir = campaignClipsDir(campaign, c.campaigns.defaultFolders.clipsDir);
          if (dir) void window.electronAPI?.showInFolder(dir);
        }}
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
  } else if (view.kind === "campaigns") {
    body = <SettingsCampaigns rows={c.rows} onEdit={(id) => c.setView({ kind: "campaign", id })} onAdd={() => c.setAdding(true)} onBack={c.back} onClose={onClose} />;
  } else if (view.kind === "folder") {
    body = (
      <SettingsFolder
        label={c.clipsFolderLabel}
        problem={problem}
        onChange={() => void c.campaigns.pickParentClipsDir().then((p) => setProblem(p ?? ""))}
        onBack={c.back}
        onClose={onClose}
      />
    );
  } else {
    body = (
      <SettingsTopList
        campaignNames={c.campaignNames}
        clipsFolderLabel={c.clipsFolderLabel}
        app={c.app}
        autoUpdate={c.autoUpdate}
        onAutoUpdate={c.setAutoUpdate}
        onPatchApp={c.patchApp}
        onOpenCampaigns={() => c.setView({ kind: "campaigns" })}
        onOpenFolder={() => c.setView({ kind: "folder" })}
        onClose={onClose}
      />
    );
  }

  return (
    <div id="ui-settings-drawer" className="absolute inset-y-0 right-0 z-30 max-w-full overflow-y-auto">
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
