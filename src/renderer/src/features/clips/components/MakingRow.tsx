/**
 * File: MakingRow.tsx
 * Path: src/renderer/src/features/clips/components/MakingRow.tsx
 * Description: The top row of Export. While a clip is made: its name, "Preparing" (a loop) and then
 *   "Making · 58%" with progress on the row edge. When it is saved: a full Frost line, the name,
 *   "Undo · 5 s left", and the three icon buttons.
 */
import { motion } from "framer-motion";
import RowIconButton from "../../../shared/components/RowIconButton";
import { IconInEditor, IconShowFile } from "../../../shared/components/rowIcons";
import { makingText, undoText } from "../utils/exportRows";
import UndoRing from "./UndoRing";

export type MakingRowProps =
  | { kind: "making"; name: string; percent: number; phase: string }
  | {
      kind: "finished";
      name: string;
      secondsLeft: number;
      canShow: boolean;
      onUndo: () => void;
      onShow: () => void;
      onInEditor: () => void;
    };

export default function MakingRow(props: MakingRowProps) {
  if (props.kind === "making") {
    const preparing = props.percent < 1 && props.phase !== "processing";
    return (
      <div className="relative mx-[10px] mb-[6px] mt-[10px] overflow-hidden rounded-control bg-raised px-[10px] py-[9px]">
        <div className="text-body font-medium">{props.name}</div>
        <div className="mt-[2px] text-meta text-fg-dim" role="status">
          {makingText(props.percent, props.phase)}
        </div>
        {preparing ? (
          <motion.span
            className="absolute bottom-0 left-0 h-[2px] w-1/3 bg-ice"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <span className="absolute bottom-0 left-0 h-[2px] bg-ice" style={{ width: `${Math.min(100, props.percent)}%` }} />
        )}
      </div>
    );
  }
  return (
    <div className="relative mx-[10px] mb-[6px] mt-[10px] flex items-center gap-2 overflow-hidden rounded-control border border-hairlineStrong bg-raised py-2 pl-[10px] pr-[6px]">
      <div className="min-w-0">
        <div className="truncate text-body font-medium">{props.name}</div>
        <div className="mt-[2px] text-meta text-fg-dim" role="status">
          {undoText(props.secondsLeft)}
        </div>
      </div>
      <span className="ml-auto flex gap-1">
        <UndoRing secondsLeft={props.secondsLeft} onUndo={props.onUndo} />
        <RowIconButton label="Show in Finder" onClick={props.onShow} disabled={!props.canShow}>
          <IconShowFile />
        </RowIconButton>
        <RowIconButton label="In editor" onClick={props.onInEditor} disabled={!props.canShow}>
          <IconInEditor />
        </RowIconButton>
      </span>
      <span className="absolute bottom-0 left-0 h-[2px] w-full bg-frost" />
    </div>
  );
}
