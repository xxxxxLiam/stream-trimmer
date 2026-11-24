/**
 * File: HelpAbout.tsx
 * Path: src/renderer/src/features/help/components/HelpAbout.tsx
 * Description: Help > About Clipr: the version and nothing else.
 */
import { DrawerHeader, drawerBody } from "../../../shared/components/DrawerRows";

export default function HelpAbout({ version, onBack, onClose }: { version: string; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <DrawerHeader title="About Clipr" back="Help" onBack={onBack} closeName="Help" onClose={onClose} />
      <div className={`${drawerBody} gap-3`}>
        <p className="m-0 text-body">{version ? `Clipr ${version}` : "Clipr"}</p>
        <p className="m-0 text-meta text-fg-dim">Only the seconds you need. No ads, no account.</p>
      </div>
    </>
  );
}
