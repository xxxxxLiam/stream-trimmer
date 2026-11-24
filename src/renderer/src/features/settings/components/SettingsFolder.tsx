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
      <div className="flex items-center gap-3 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body">Clips folder</span>
          <span className="truncate text-meta text-fg-dim">{p.label}</span>
        </div>
        <button type="button" aria-label="Change the clips folder" onClick={p.onChange} className={outlineButton}>
          Change
        </button>
      </div>
      {p.problem && <p role="alert" className="m-0 text-meta text-error">{p.problem}</p>}
      <p className="m-0 text-meta text-fg-dim">A folder per campaign is made inside it. The folder button in the bottom bar changes this same folder.</p>
      </div>
    </>
  );
}
