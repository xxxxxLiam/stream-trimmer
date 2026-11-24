/**
 * File: PanelResizeHandle.tsx
 * Path: src/renderer/src/modules/layout/components/PanelResizeHandle.tsx
 * Description: A drag handle between two areas of the workspace. A real focusable separator:
 *   arrows nudge, Shift+arrows nudge further, Home/End jump to the limits, Enter or a
 *   double-click goes back to the default.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export type PanelResizeHandleProps = {
  orientation: "vertical" | "horizontal";
  /** Names what resizes, e.g. "Resize left panels". */
  label: string;
  value: number;
  min: number;
  max: number;
  /** True when dragging toward the start of the axis (left or up) makes the area bigger. */
  grows: "with-pointer" | "against-pointer";
  onChange: (px: number, persist: boolean) => void;
  onReset: () => void;
};

const STEP = 16;
const BIG_STEP = 64;

export default function PanelResizeHandle({
  orientation,
  label,
  value,
  min,
  max,
  grows,
  onChange,
  onReset,
}: PanelResizeHandleProps) {
  const start = useRef({ pointer: 0, value: 0 });
  const horizontalBar = orientation === "horizontal";
  const sign = grows === "with-pointer" ? 1 : -1;
  // The keys follow the picture: on a vertical separator Right moves the line right.
  const keyDir = (key: string) => {
    const [dec, inc] = horizontalBar ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    return key === dec ? -1 : key === inc ? 1 : 0;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") return void (e.preventDefault(), onReset());
    if (e.key === "Home") return void (e.preventDefault(), onChange(min, true));
    if (e.key === "End") return void (e.preventDefault(), onChange(max, true));
    const dir = keyDir(e.key);
    if (!dir) return;
    e.preventDefault();
    onChange(value + dir * sign * (e.shiftKey ? BIG_STEP : STEP), true);
  };
  const axis = (e: PointerEvent) => (horizontalBar ? e.clientY : e.clientX);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    start.current = { pointer: axis(e), value };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    onChange(start.current.value + sign * (axis(e) - start.current.pointer), false);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onChange(value, true);
  };

  return (
    <div
      role="separator"
      aria-orientation={horizontalBar ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag, or use the arrow keys, to resize. Double-click or press Enter to reset."
      className={`panel-handle shrink-0 ${horizontalBar ? "panel-handle-h h-2 cursor-row-resize" : "panel-handle-v w-2 cursor-col-resize"}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
    />
  );
}
