/**
 * File: PleaseUpdateScreen.tsx
 * Path: src/renderer/src/features/updates/components/PleaseUpdateScreen.tsx
 * Description: Board 03.2.55 (approved 26 Nov). Shown INSTEAD of the workspace when this version is below the server's
 *   minimum: the mark, a plain sentence, the two versions, one light "Download the update" button and a quiet Quit.
 *   Nothing else is clickable: no close, no skip. Ice appears once, in the mark, so the button is plain light.
 *   Logic-free: VersionGate feeds it.
 */
import { BoxArrowUpRight } from "react-bootstrap-icons";
import TitleBarDrag from "../../../modules/layout/components/TitleBarDrag";
import BrandMark from "../../../shared/components/BrandMark";

export type PleaseUpdateScreenProps = {
  current: string;
  required: string;
  onDownload: () => void;
  onQuit: () => void;
};

function VersionRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex h-target items-center justify-between text-body ${last ? "" : "border-b border-hairline"}`}>
      <span className="text-fg-dim">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

export default function PleaseUpdateScreen(p: PleaseUpdateScreenProps) {
  return (
    <div role="alertdialog" aria-labelledby="ui-update-title" id="ui-please-update" className="flex h-screen w-full items-center justify-center bg-bg p-[24px] text-fg">
      <TitleBarDrag />
      <div className="flex w-[400px] max-w-full flex-col items-center">
        <BrandMark size={56} />
        <h1 id="ui-update-title" className="m-[0px] mt-[24px] text-title">Please update Clipr</h1>
        <p className="m-[0px] mt-[12px] text-center text-body text-fg-dim">This version is too old to keep running. Install the latest one and carry on where you left off.</p>
        <div className="mt-[24px] w-full">
          <VersionRow label="Your version" value={p.current} />
          <VersionRow label="Needed" value={p.required} last />
        </div>
        <button
          type="button"
          id="ui-update-download"
          onClick={p.onDownload}
          className="mt-[24px] flex h-target w-full items-center justify-center gap-[8px] rounded-pill bg-fg text-body font-medium text-bg"
        >
          Download the update
          <BoxArrowUpRight size={13} aria-hidden="true" />
        </button>
        <button type="button" id="ui-update-quit" onClick={p.onQuit} className="mt-[8px] h-target px-[16px] text-body text-fg-dim hover:text-fg">
          Quit
        </button>
      </div>
    </div>
  );
}
