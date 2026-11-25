/**
 * File: MakingRow.tsx
 * Path: src/renderer/src/features/clips/components/MakingRow.tsx
 * Description: The top row of Export, as drawn on boards 03.2.12 (Preparing), 03.2.1 (Making 58%) and
 *   03.2.2 (Undo ring). While a clip is made: its name and "Preparing" with a short Ice line sliding on
 *   the edge, then "Making · 58%" with progress on the edge. When it is saved: a full Frost line, the
 *   name, "Undo · 5 s left", and the Undo ring with Show in Finder and In editor. Sizes are explicit
 *   px because the board's are (the app root is 13px).
 */
import { motion } from "framer-motion";
import { useEffect } from "react";
import { RETRY_SENTENCE } from "../../../../../common/types/clipRowState";
import RowIconButton from "../../../shared/components/RowIconButton";
import { IconClose, IconInEditor, IconShowFile } from "../../../shared/components/rowIcons";
import { failureCopy } from "../utils/clipFailure";
import { makingText, undoText } from "../utils/exportRows";
import UndoRing from "./UndoRing";

export type MakingRowProps =
  | { kind: "making"; name: string; percent: number; phase: string; retrying?: boolean; onCancel?: () => void }
  | {
      kind: "finished";
      name: string;
      secondsLeft: number;
      canShow: boolean;
      onUndo: () => void;
      onShow: () => void;
      onInEditor: () => void;
    };

const NAME = "text-body font-medium leading-[normal]";
const SUB = "mt-[2px] text-meta leading-[normal] text-fg-dim";

// Board 03.2.12: a 32px ✕ on the hover fill at the row's right. Hover or focus shows "Stop making it · Esc"
// below it; Esc does the same while nothing else (a drawer, a dialog, a field) is using the key.
function StopButton({ onStop }: { onStop: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStop]);
  return (
    <span className="group relative ml-auto flex-none">
      <button
        type="button"
        aria-label="Stop making it"
        aria-keyshortcuts="Escape"
        onClick={onStop}
        className="inline-flex size-[32px] items-center justify-center rounded-control bg-hover text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
      >
        <IconClose />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-10 hidden whitespace-nowrap rounded-chip border border-hairlineStrong bg-hover px-[8px] py-[5px] text-meta leading-[normal] text-fg group-focus-within:block group-hover:block"
      >
        Stop making it<span className="ml-[8px] text-fg-dim">Esc</span>
      </span>
    </span>
  );
}

export default function MakingRow(props: MakingRowProps) {
  if (props.kind === "making") {
    const preparing = props.retrying || (props.percent < 1 && props.phase !== "processing");
    return (
      <div
        role="progressbar"
        aria-label={`${props.name}, ${preparing ? "preparing" : makingText(props.percent, props.phase)}`}
        className="relative mx-[10px] mb-[6px] mt-[10px] flex items-center gap-[8px] rounded-control bg-raised py-[9px] pl-[10px] pr-[6px]"
      >
        <div className="min-w-0">
          <div className={NAME}>{props.name}</div>
          {props.retrying ? (
            <div className="mt-[3px] text-meta leading-[1.45]">
              <span className="text-error">{failureCopy("stopped", 1).reason}</span>{" "}
              <span className="text-fg-dim">{RETRY_SENTENCE}</span>
            </div>
          ) : (
            <div className={SUB}>{makingText(props.percent, props.phase)}</div>
          )}
        </div>
        {props.onCancel && <StopButton onStop={props.onCancel} />}
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-control">
          {preparing ? (
            <>
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-hairline" />
              <motion.span
                className="absolute bottom-0 h-[2px] w-[56px] rounded-[1px] bg-ice"
                initial={{ left: "-56px" }}
                animate={{ left: ["-56px", "100%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          ) : (
            <span className="absolute bottom-0 left-0 h-[2px] bg-ice" style={{ width: `${Math.min(100, props.percent)}%` }} />
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="relative mx-[10px] mb-[6px] mt-[10px] flex items-center gap-[8px] overflow-hidden rounded-control border border-hairlineStrong bg-raised py-[8px] pl-[10px] pr-[6px]">
      <div className="min-w-0">
        <div className={NAME}>{props.name}</div>
        <div className={SUB} role="status">
          {undoText(props.secondsLeft)}
        </div>
      </div>
      <span className="ml-auto flex gap-[4px]">
        <UndoRing secondsLeft={props.secondsLeft} onUndo={props.onUndo} />
        <RowIconButton label="Show in Finder" onClick={props.onShow} disabled={!props.canShow}>
          <IconShowFile />
        </RowIconButton>
        <RowIconButton label="In editor" onClick={props.onInEditor} disabled={!props.canShow}>
          <IconInEditor />
        </RowIconButton>
      </span>
      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-frost" />
    </div>
  );
}
