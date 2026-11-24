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
      <ul className={`${drawerBody} m-0 list-none`} aria-label="Keyboard shortcuts">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex min-h-target items-center gap-3 border-b border-hairline py-2">
            <kbd className="min-w-[72px] rounded-chip border border-hairlineStrong bg-bg px-2 py-[3px] font-sans text-meta text-fg-dim">
              {ctrl ? s.keys.replace("⌘", "Ctrl") : s.keys}
            </kbd>
            <span className="flex-1 text-body">{s.does}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
