/**
 * File: SettingsTopList.tsx
 * Path: src/renderer/src/features/settings/components/SettingsTopList.tsx
 * Description: Settings, top list (Settings.dc.html view 1): Your work (Campaigns, and the Clips folder with its Change button) and
 *   This computer (two switches). No Editor row, no quality row, no crash switch.
 */
import { ChevronRow, DrawerHeader, SectionLabel, SwitchRow, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";
import type { AppPrefs } from "../utils/settingsPrefs";

export type SettingsTopListProps = {
  campaignNames: string;
  clipsFolderLabel: string;
  app: AppPrefs;
  autoUpdate: boolean;
  /** False on macOS, where the build is unsigned and cannot update itself: the switch would do nothing, so it is not shown. */
  autoUpdateAvailable?: boolean;
  onAutoUpdate: (on: boolean) => void;
  onPatchApp: (p: Partial<AppPrefs>) => void;
  onOpenCampaigns: () => void;
  folderProblem?: string;
  /** The folder page held one control, so it is a flat Change button on the row (Liam, 25 Nov). */
  onChangeFolder: () => void;
  signedIn?: boolean;
  onOpenSignIn: () => void;
  onClose: () => void;
};

export default function SettingsTopList(p: SettingsTopListProps) {
  return (
    <>
      <DrawerHeader closeName="Settings" title="Settings" onClose={p.onClose} />
      <div className={drawerBody}>
      <SectionLabel first>Your work</SectionLabel>
      <ChevronRow label="Campaigns" value={p.campaignNames || "None yet"} onOpen={p.onOpenCampaigns} divider />
      <div className="flex h-target items-center gap-[8px]">
        <div className="flex min-w-[0px] flex-1 flex-col">
          <span className="text-body leading-[normal]">Clips folder</span>
          <span className="truncate text-meta text-fg-dim">{p.clipsFolderLabel}</span>
        </div>
        <button type="button" aria-label="Change the clips folder" onClick={p.onChangeFolder} className={outlineButton}>
          Change
        </button>
      </div>
      {p.folderProblem && <p role="alert" className="m-[0px] text-meta text-error">{p.folderProblem}</p>}
      <SectionLabel>YouTube</SectionLabel>
      <ChevronRow label="Sign in for 1080p" value={p.signedIn ? "Signed in" : "Not signed in"} onOpen={p.onOpenSignIn} />
      <SectionLabel>This computer</SectionLabel>
      <SwitchRow label="Tell me when the queue finishes" on={p.app.notifyQueueDone} onFlip={() => p.onPatchApp({ notifyQueueDone: !p.app.notifyQueueDone })} divider={p.autoUpdateAvailable !== false} />
      {p.autoUpdateAvailable !== false && <SwitchRow label="Update automatically" on={p.autoUpdate} onFlip={() => p.onAutoUpdate(!p.autoUpdate)} />}
      <p className="m-[0px] mt-[12px] text-meta text-fg-dim">Pick a row to change it. A back arrow returns to this list.</p>
      </div>
    </>
  );
}
