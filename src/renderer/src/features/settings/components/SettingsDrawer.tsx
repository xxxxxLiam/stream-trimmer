/**
 * File: SettingsDrawer.tsx
 * Path: src/renderer/src/features/settings/components/SettingsDrawer.tsx
 * Description: The 440px Settings drawer on the right (Settings.dc.html 04.6). It sits over the Export
 *   panel while open and blocks nothing else. Rows with a chevron open a second view, switches flip in
 *   place, Back shows the parent's name, X and Escape close.
 */
import { useState } from "react";
import { Drawer } from "../../../shared/components/Drawer";
import CampaignWizard from "../../campaigns/components/CampaignWizard";
import SettingsCampaign from "./SettingsCampaign";
import SettingsCampaigns from "./SettingsCampaigns";
import SettingsFolder from "./SettingsFolder";
import SettingsTopList from "./SettingsTopList";
import { useSettingsController } from "../hooks/useSettingsController";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { DEFAULT_DAILY_QUOTA, toggleLanguage } from "../utils/settingsPrefs";
import type { AudioTrack } from "../../../shared/utils/clip";
import type { EditorHandoffSettings } from "../../../shared/utils/fcpxml";

export type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Campaign to land on, from "<Campaign> settings" in the campaign menu. */
  startAt: string | null;
  /** Audio tracks of the open video; its dubs become the language chips. */
  tracks?: AudioTrack[];
  /** The active campaign's Final Cut settings; other campaigns' are not loaded. */
  editor: { campaignId: string | null; settings: EditorHandoffSettings; onChange: (s: EditorHandoffSettings) => void };
};

export default function SettingsDrawer({ open, onClose, startAt, tracks, editor }: SettingsDrawerProps) {
  const c = useSettingsController({ open, onClose, startAt });
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!open) return null;
  const { view } = c;
  const campaign = view.kind === "campaign" ? c.campaigns.campaigns.find((x) => x.id === view.id) : undefined;

  let body;
  if (view.kind === "campaign" && campaign) {
    const isActive = editor.campaignId === campaign.id;
    body = (
      <SettingsCampaign
        name={campaign.name}
        prefs={c.prefsFor(campaign.id)}
        dubs={(tracks ?? []).filter((t) => t.kind !== "original").map((t) => ({ code: t.language, label: t.label }))}
        quota={campaign.dailyQuota ?? DEFAULT_DAILY_QUOTA}
        onQuota={(n) => c.campaigns.update(campaign.id, { dailyQuota: n })}
        folderLabel={folderChipLabel(campaign.clipsDir)}
        finalCut={
          isActive && editor.settings.afterCutting === "finalcut"
            ? {
                library: editor.settings.fcpLibrary ? (editor.settings.fcpLibrary.split(/[\\/]/).pop() ?? "") : "",
                event: editor.settings.mediaEvent,
                onChoose: () => {
                  void window.electronAPI?.pickFcpLibrary?.().then((p) => {
                    if (p) editor.onChange({ ...editor.settings, fcpLibrary: p });
                  });
                },
                onEvent: (v) => editor.onChange({ ...editor.settings, mediaEvent: v }),
              }
            : null
        }
        onPatch={(patch) => c.patchCampaign(campaign.id, patch)}
        onToggleLanguage={(code) => c.patchCampaign(campaign.id, { languages: toggleLanguage(c.prefsFor(campaign.id).languages, code) })}
        onOpenFolder={() => campaign.clipsDir && void window.electronAPI?.showInFolder(campaign.clipsDir)}
        confirmingDelete={confirming === campaign.id}
        onDelete={() => {
          if (confirming === campaign.id) {
            setConfirming(null);
            c.campaigns.remove(campaign.id);
          } else setConfirming(campaign.id);
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
        onChange={() => void c.campaigns.pickClipsDir().then((p) => setProblem(p ?? ""))}
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
      <CampaignWizard
        open={c.adding}
        onClose={() => c.setAdding(false)}
        onCreated={(made) => {
          c.setAdding(false);
          c.campaigns.update(made.id, { dailyQuota: DEFAULT_DAILY_QUOTA });
          c.setView({ kind: "campaign", id: made.id });
        }}
      />
    </div>
  );
}
