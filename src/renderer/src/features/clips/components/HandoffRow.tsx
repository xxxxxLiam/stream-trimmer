/**
 * File: HandoffRow.tsx
 * Path: src/renderer/src/features/clips/components/HandoffRow.tsx
 * Description: What happened when the clip just made was sent to the editor. A failure is one plain
 *   sentence in error red with a 1px error border and no fill (CLAUDE.md), then Show in folder and
 *   Send to another editor (the Clip menu's list). When the editor can't take a project it says it
 *   opened the editor and showed the file, in the dim tier. Logic-free.
 */
import { useState } from "react";
import { DESTINATIONS, type ClipDestination } from "../../player/utils/clipDestination";
import type { HandoffNotice } from "../utils/handoffNotice";
import { PILL_HIT, PRIMARY_PILL, QUIET_PILL } from "../../../shared/utils/pillClasses";

export type HandoffRowProps = {
  notice: HandoffNotice;
  /** The editor that was tried, left out of "Send to another editor". */
  tried: ClipDestination;
  onShowInFolder: () => void;
  onSendTo: (destination: ClipDestination) => void;
};

export default function HandoffRow({ notice, tried, onShowInFolder, onSendTo }: HandoffRowProps) {
  const [choosing, setChoosing] = useState(false);
  const failed = notice.tone === "error";
  return (
    <div
      role={failed ? "alert" : "status"}
      className={`mx-[10px] mb-[6px] mt-[6px] rounded-control px-[10px] pb-[2px] pt-[9px] leading-[normal] ${
        failed ? "border border-error" : "bg-raised"
      }`}
    >
      <p className={`text-meta leading-[1.45] ${failed ? "text-error" : "text-fg-dim"}`}>{notice.message}</p>
      <div className="flex flex-wrap gap-[6px]">
        {notice.clipPath && (
          <button type="button" aria-label="Show in folder" className={PILL_HIT} onClick={onShowInFolder}>
            <span className={QUIET_PILL}>Show in folder</span>
          </button>
        )}
        {failed && (
          <button
            type="button"
            aria-expanded={choosing}
            aria-label="Send to another editor"
            className={PILL_HIT}
            onClick={() => setChoosing((v) => !v)}
          >
            <span className={QUIET_PILL}>Send to another editor</span>
          </button>
        )}
      </div>
      {failed && choosing && (
        <div role="group" aria-label="Send to another editor" className="flex flex-wrap gap-[6px] pb-[8px]">
          {DESTINATIONS.filter((d) => d.id !== "folder" && d.id !== tried).map((d) => (
            <button key={d.id} type="button" className={PILL_HIT} onClick={() => onSendTo(d.id)}>
              <span className={QUIET_PILL}>{d.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
