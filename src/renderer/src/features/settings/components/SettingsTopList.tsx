/**
 * File: SettingsTopList.tsx
 * Path: src/renderer/src/features/settings/components/SettingsTopList.tsx
 * Description: Settings, top list (Settings.dc.html view 1): Your work (Campaigns, Clips folder) and
 *   This computer (two switches). No Editor row, no quality row, no crash switch.
 */
import { ChevronRow, DrawerHeader, SectionLabel, SwitchRow, drawerBody } from "./DrawerParts";
import type { AppPrefs } from "../utils/settingsPrefs";

export type SettingsTopListProps = {
  campaignNames: string;
  clipsFolderLabel: string;
  app: AppPrefs;
  onPatchApp: (p: Partial<AppPrefs>) => void;
  onOpenCampaigns: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
};

export default function SettingsTopList(p: SettingsTopListProps) {
  return (
    <>
      <DrawerHeader title="Settings" onClose={p.onClose} />
      <div className={drawerBody}>
      <SectionLabel first>Your work</SectionLabel>
      <ChevronRow label="Campaigns" value={p.campaignNames || "None yet"} onOpen={p.onOpenCampaigns} divider />
      <ChevronRow label="Clips folder" value={p.clipsFolderLabel} onOpen={p.onOpenFolder} />
      <SectionLabel>This computer</SectionLabel>
      <SwitchRow label="Tell me when the queue finishes" on={p.app.notifyQueueDone} onFlip={() => p.onPatchApp({ notifyQueueDone: !p.app.notifyQueueDone })} divider />
      <SwitchRow label="Update automatically" on={p.app.autoUpdate} onFlip={() => p.onPatchApp({ autoUpdate: !p.app.autoUpdate })} />
      <p className="m-0 mt-3 text-meta text-fg-dim">Pick a row to change it. A back arrow returns to this list.</p>
      </div>
    </>
  );
}
