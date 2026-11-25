/**
 * File: SettingsFolder.tsx
 * Path: src/renderer/src/features/settings/components/SettingsFolder.tsx
 * Description: Clips folder view (Settings.dc.html view 4): the folder and a Change button.
 */
import { DrawerHeader, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";

export default function SettingsFolder(p: { label: string; problem: string; onChange: () => void; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <DrawerHeader closeName="Settings" title="Clips folder" back="Settings" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
      <div className="flex items-center gap-[12px] py-[12px]">
        <div className="flex min-w-[0px] flex-1 flex-col gap-[2px]">
          <span className="text-body leading-[normal]">Clips folder</span>
          <span className="truncate text-meta text-fg-dim">{p.label}</span>
        </div>
        <button type="button" aria-label="Change the clips folder" onClick={p.onChange} className={outlineButton}>
          Change
        </button>
      </div>
      {p.problem && <p role="alert" className="m-[0px] text-meta text-error">{p.problem}</p>}
      <p className="m-[0px] text-meta text-fg-dim">A folder per campaign is made inside it. The folder button in the bottom bar changes this same folder.</p>
      </div>
    </>
  );
}
