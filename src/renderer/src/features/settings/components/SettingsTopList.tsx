/**
 * File: SettingsTopList.tsx
 * Path: src/renderer/src/features/settings/components/SettingsTopList.tsx
 * Description: Settings, top list: Campaigns listed right here (a few at most, so no page of their own; each row
 *   opens that campaign, whose folder is set there), YouTube sign-in, and This computer (two switches).
 *   No global Clips folder row (Liam, 25 Nov), no Editor row, no quality row, no crash switch.
 */
import { ChevronRow, DrawerHeader, SectionLabel, SwitchRow, drawerBody } from "../../../shared/components/DrawerRows";
import { ChevronRight } from "react-bootstrap-icons";
import type { AppPrefs } from "../utils/settingsPrefs";

export type CampaignRow = { id: string; name: string; summary: string; languages: string | null };

export type SettingsTopListProps = {
  rows: CampaignRow[];
  onEdit: (id: string) => void;
  onAdd: () => void;
  app: AppPrefs;
  autoUpdate: boolean;
  /** False on macOS, where the build is unsigned and cannot update itself: the switch would do nothing, so it is not shown. */
  autoUpdateAvailable?: boolean;
  onAutoUpdate: (on: boolean) => void;
  onPatchApp: (p: Partial<AppPrefs>) => void;
  /** "Checking…", "Signed in", "Saved" or "Not signed in" (signInRowValue). */
  signInValue?: string;
  onOpenSignIn: () => void;
  onClose: () => void;
};

export default function SettingsTopList(p: SettingsTopListProps) {
  return (
    <>
      <DrawerHeader closeName="Settings" title="Settings" onClose={p.onClose} />
      <div className={drawerBody}>
      <SectionLabel first>Campaigns</SectionLabel>
      {p.rows.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-label={`${r.name}: ${r.summary}`}
          onClick={() => p.onEdit(r.id)}
          className="flex h-target items-center gap-[8px] border-b border-hairline bg-transparent text-left text-body leading-[normal] text-fg"
        >
          <span className="min-w-[0px] flex-1 truncate">{r.name}</span>
          <span className="text-meta text-fg-dim">{r.summary}</span>
          {/* Liam, 25 Nov: a chevron, like every other row that opens something; the gear stays in the top-left campaign menu only. */}
          <span className="inline-flex text-fg-dim"><ChevronRight width={16} height={16} aria-hidden="true" focusable="false" /></span>
        </button>
      ))}
      {p.rows.length === 0 && <p className="m-[0px] py-[8px] text-meta text-fg-dim">No campaigns yet.</p>}
      <button type="button" aria-label="Add campaign" onClick={p.onAdd} className="mt-[8px] h-target rounded-control border border-hairlineStrong bg-raised text-body leading-[normal] text-fg hover:bg-hover">
        Add campaign
      </button>
      <SectionLabel>YouTube</SectionLabel>
      <ChevronRow label="Sign in for 1080p" value={p.signInValue ?? "Not signed in"} onOpen={p.onOpenSignIn} />
      <SectionLabel>This computer</SectionLabel>
      <SwitchRow label="Tell me when the queue finishes" on={p.app.notifyQueueDone} onFlip={() => p.onPatchApp({ notifyQueueDone: !p.app.notifyQueueDone })} divider={p.autoUpdateAvailable !== false} />
      {p.autoUpdateAvailable !== false && <SwitchRow label="Update automatically" on={p.autoUpdate} onFlip={() => p.onAutoUpdate(!p.autoUpdate)} />}
      </div>
    </>
  );
}
