/**
 * File: ColumnHandle.tsx
 * Path: src/components/shell/ColumnHandle.tsx
 * Description: A drag handle between two workspace columns. A real focusable separator:
 *   arrows nudge, Shift+arrows nudge further, Home/End jump to min/max, Enter or a
 *   double-click resets to the default. All sizing decisions come from columnSizes.ts.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { moveForKey, type ColumnKind, type KeyMove } from "./columnSizes";

export type ColumnHandleProps = {
  /** The side column this handle resizes. */
  kind: ColumnKind;
  /** Current width of that column, and its allowed range. */
  value: number;
  min: number;
  max: number;
  onKeyMove: (move: KeyMove, large: boolean) => void;
  onDragStart: () => void;
  onDragTo: (dx: number) => void;
  onDragEnd: () => void;
  onReset: () => void;
};

const LABEL: Record<ColumnKind, string> = {
  transcript: "Resize transcript column",
  clips: "Resize clips column",
};
const NAME: Record<ColumnKind, string> = { transcript: "Transcript", clips: "Clips" };

export default function ColumnHandle({
  kind,
  value,
  min,
  max,
  onKeyMove,
  onDragStart,
  onDragTo,
  onDragEnd,
  onReset,
}: ColumnHandleProps) {
  const startX = useRef(0);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onReset();
      return;
    }
    const move = moveForKey(kind, e.key);
    if (!move) return;
    e.preventDefault();
    onKeyMove(move, e.shiftKey);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onDragStart();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) onDragTo(e.clientX - startX.current);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onDragEnd();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={LABEL[kind]}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${NAME[kind]} column ${value} pixels wide`}
      tabIndex={0}
      title="Drag, or use the arrow keys, to resize. Double-click or press Enter to reset."
      className={`col-handle col-handle-${kind}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
    />
  );
}
