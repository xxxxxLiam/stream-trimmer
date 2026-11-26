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

export type CampaignRow = { id: string; name: string; summary: string; languages: string | null; /** A location: a name and a folder, no quota. */ location?: boolean };

export type SettingsTopListProps = {
  rows: CampaignRow[];
  onEdit: (id: string) => void;
  onAdd: () => void;
  onAddLocation: () => void;
  /** The folder a location makes ("Clipr B-roll"), the summary under its name. */
  locationFolder?: (name: string) => string;
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

const plusRow = "mt-[4px] flex h-target items-center gap-[8px] bg-transparent text-left text-body leading-[normal] text-fg";

export default function SettingsTopList(p: SettingsTopListProps) {
  const rowButton = (r: CampaignRow, summary: string) => (
    <button
      key={r.id}
      type="button"
      aria-label={`${r.name}: ${summary}`}
      onClick={() => p.onEdit(r.id)}
      className="flex h-target items-center gap-[8px] border-b border-hairline bg-transparent text-left text-body leading-[normal] text-fg"
    >
      <span className="min-w-[0px] flex-1 truncate">{r.name}</span>
      <span className="text-meta text-fg-dim">{summary}</span>
      {/* Liam, 25 Nov: a chevron, like every other row that opens something; the gear stays in the top-left campaign menu only. */}
      <span className="inline-flex text-fg-dim"><ChevronRight width={16} height={16} aria-hidden="true" focusable="false" /></span>
    </button>
  );
  return (
    <>
      <DrawerHeader closeName="Settings" title="Settings" onClose={p.onClose} />
      <div className={drawerBody}>
      <SectionLabel first>Campaigns</SectionLabel>
      {p.rows.filter((r) => !r.location).map((r) => rowButton(r, r.summary))}
      {p.rows.every((r) => r.location) && <p className="m-[0px] py-[8px] text-meta text-fg-dim">No campaigns yet.</p>}
      <button type="button" aria-label="New campaign" onClick={p.onAdd} className={plusRow}>
        <span className="w-[16px] text-center text-fg-dim">+</span>New campaign
      </button>
      {p.rows.some((r) => r.location) && <SectionLabel>Locations</SectionLabel>}
      {p.rows.filter((r) => r.location).map((r) => rowButton(r, p.locationFolder?.(r.name) ?? ""))}
      <button type="button" aria-label="New location" onClick={p.onAddLocation} className={plusRow}>
        <span className="w-[16px] text-center text-fg-dim">+</span>New location
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
