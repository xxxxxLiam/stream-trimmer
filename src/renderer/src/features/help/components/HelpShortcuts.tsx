/**
 * File: HelpShortcuts.tsx
 * Path: src/renderer/src/features/help/components/HelpShortcuts.tsx
 * Description: Help > Keyboard shortcuts: the same list as the Keyboard board. ⌘ reads as Ctrl on Windows.
 */
import { DrawerHeader, drawerBody } from "../../../shared/components/DrawerRows";
import { SHORTCUTS } from "../utils/helpContent";

export default function HelpShortcuts({ ctrl, onBack, onClose }: { ctrl: boolean; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <DrawerHeader title="Keyboard shortcuts" back="Help" onBack={onBack} closeName="Help" onClose={onClose} />
      <ul className={`${drawerBody} m-[0px] list-none p-[0px]`} aria-label="Keyboard shortcuts">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex min-h-target items-center gap-[12px] border-b border-hairline py-[8px]">
            <kbd className="min-w-[72px] rounded-chip border border-hairlineStrong bg-bg px-[8px] py-[3px] font-sans text-meta text-fg-dim">
              {ctrl ? s.keys.replace("⌘", "Ctrl") : s.keys}
            </kbd>
            <span className="flex-1 text-body leading-[normal]">{s.does}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
