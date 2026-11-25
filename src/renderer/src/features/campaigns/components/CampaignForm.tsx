/**
 * File: CampaignForm.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignForm.tsx
 * Description: The new-campaign form (campaign form A): Name, Clips a day, Extra seconds (0, 1, 2) and Folder.
 *   Nothing else is asked here; Languages and the Final Cut fields are in the campaign's own settings view, which
 *   opens next. The folder is a folder named after the campaign inside the Clips folder unless one is chosen.
 *   Always dismissible: Esc, the close button or Cancel leave nothing half-created.
 */
import { useState } from "react";
import CentredDialog from "../../../shared/components/CentredDialog";
import { useCampaign } from "../hooks/CampaignContext";
import { MAX_NAME_LENGTH, campaignClipsDir, campaignNameProblems, type Campaign } from "../../../shared/utils/campaigns";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import {
  DEFAULT_CAMPAIGN_PREFS,
  DEFAULT_DAILY_QUOTA,
  EXTRA_SECONDS_CHOICES,
  saveCampaignPrefs,
  stepClipsPerDay,
  type ExtraSeconds,
} from "../../settings/utils/settingsPrefs";

const step = "h-target w-target rounded-control border border-hairlineStrong bg-raised text-section text-fg hover:bg-hover";
const field = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg outline-none focus:border-ice-tint-50";

function Body({ onClose, onCreated }: { onClose: () => void; onCreated?: (c: Campaign) => void }) {
  const { create, campaigns, defaultFolders } = useCampaign();
  const [name, setName] = useState("");
  const [quota, setQuota] = useState(DEFAULT_DAILY_QUOTA);
  const [extra, setExtra] = useState<ExtraSeconds>(DEFAULT_CAMPAIGN_PREFS.extraSeconds);
  const [own, setOwn] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const folder = campaignClipsDir({ name: name.trim() || "Campaign", clipsDir: own }, defaultFolders.clipsDir);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = campaignNameProblems(name, campaigns);
    setProblems(found);
    if (found.length) return;
    const made = create({ name, dailyQuota: quota, ...(own ? { clipsDir: own } : {}) });
    saveCampaignPrefs(made.id, { extraSeconds: extra }, (k) => readSetting<Record<string, unknown>>(k, {}), writeSetting);
    onCreated?.(made);
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[16px]" id="ui-campaign-form">
      <label className="flex flex-col gap-[4px]">
        <span className="text-meta text-fg-dim">Name</span>
        <input id="ui-campaign-name" className={field} value={name} autoFocus maxLength={MAX_NAME_LENGTH + 20} placeholder="For example, Acme podcast" onChange={(e) => setName(e.target.value)} aria-invalid={problems.length > 0} />
      </label>
      <div className="flex items-center justify-between gap-[12px]">
        <span className="text-body leading-[normal]">Clips a day</span>
        <div className="flex items-center gap-[8px]">
          <button type="button" aria-label="Fewer clips a day" onClick={() => setQuota(stepClipsPerDay(quota, -1))} className={step}>−</button>
          <span aria-live="polite" className="w-[32px] text-center text-body">{quota}</span>
          <button type="button" aria-label="More clips a day" onClick={() => setQuota(stepClipsPerDay(quota, 1))} className={step}>+</button>
        </div>
      </div>
      <div className="flex flex-col gap-[8px]">
        <span className="text-body leading-[normal]">Extra seconds at both ends</span>
        <div className="flex gap-[8px]" role="group" aria-label="Extra seconds at both ends">
          {EXTRA_SECONDS_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={extra === n}
              onClick={() => setExtra(n)}
              className={`h-target w-[44px] rounded-[22px] border text-body ${extra === n ? "border-ice bg-ice-tint-12 text-fg" : "border-hairlineStrong bg-raised text-fg hover:bg-hover"}`}
            >
              {n}s
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-body leading-[normal]">Folder</span>
          <span className="truncate text-meta text-fg-dim" title={folder}>{folder ? folderChipLabel(folder, 3) : "Set the Clips folder in Settings"}</span>
        </div>
        {typeof window !== "undefined" && window.electronAPI?.pickDirectory && (
          <button
            type="button"
            onClick={() => void window.electronAPI?.pickDirectory().then((d) => d && setOwn(d))}
            className="h-target rounded-control border border-hairlineStrong bg-raised px-[16px] text-body leading-[normal] text-fg hover:bg-hover"
          >
            Choose
          </button>
        )}
      </div>
      {problems.length > 0 && (
        <div role="alert" className="rounded-control border border-error bg-raised px-[12px] py-[8px] text-body">
          {problems.join(" ")}
        </div>
      )}
      <div className="flex justify-end gap-[8px]">
        <button type="button" onClick={onClose} className="h-target rounded-control border border-hairlineStrong bg-raised px-[16px] text-body text-fg hover:bg-hover">Cancel</button>
        <button type="submit" className="h-target rounded-control bg-ice px-[16px] text-body font-medium text-bg">Create campaign</button>
      </div>
    </form>
  );
}

export default function CampaignForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Campaign) => void }) {
  return (
    <CentredDialog open={open} onClose={onClose} title="New campaign" widthClass="max-w-[480px]" id="ui-campaign-form-dialog">
      <Body onClose={onClose} onCreated={onCreated} />
    </CentredDialog>
  );
}
