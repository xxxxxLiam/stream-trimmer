/**
 * File: HelpAbout.tsx
 * Path: src/renderer/src/features/help/components/HelpAbout.tsx
 * Description: Help > About Clipr: the version and nothing else.
 */
import { DrawerHeader, drawerBodyRoomy } from "../../../shared/components/DrawerRows";

export default function HelpAbout({ version, onBack, onClose }: { version: string; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <DrawerHeader title="About Clipr" back="Help" onBack={onBack} closeName="Help" onClose={onClose} />
      <div className={drawerBodyRoomy}>
        <p className="m-[0px] text-body">{version ? `Clipr ${version}` : "Clipr"}</p>
        <p className="m-[0px] text-meta text-fg-dim">Only the seconds you need. No ads, no account.</p>
      </div>
    </>
  );
}
