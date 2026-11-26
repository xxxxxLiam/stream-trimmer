/**
 * File: TimelineTools.tsx
 * Path: src/renderer/src/features/player/components/TimelineTools.tsx
 * Description: The 45px row at the top of the timeline panel: the six tools on the left, zoom with Fit on
 *   the right, a hairline under it. The tools and zoom are shared state (useToolState) the lanes read.
 */
import type { ReactElement } from "react";
import {
  IconFlag,
  IconHand,
  IconPointer,
  IconRange,
  IconScissors,
  IconZoomTool,
} from "../../../modules/layout/components/BarIcons";
import { TOOL_KEYS, ZOOM_MIN, useToolState, type TimelineTool } from "../../../modules/layout/hooks/useToolState";
import { Magnet } from "react-bootstrap-icons";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { zoomFromX, zoomThumbPercent } from "../utils/laneTools";
import { clockTime } from "../utils/transport";

const TOOLS: { tool: TimelineTool; label: string; icon: () => ReactElement }[] = [
  { tool: "pointer", label: "Pointer", icon: IconPointer },
  { tool: "clip", label: "Scissors", icon: IconScissors },
  { tool: "range", label: "Select range", icon: IconRange },
  { tool: "flag", label: "Flag tool", icon: IconFlag },
  { tool: "hand", label: "Hand", icon: IconHand },
  { tool: "zoom", label: "Zoom tool", icon: IconZoomTool },
];

const STEP_BUTTON = "inline-flex h-[36px] w-[32px] items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg";

export default function TimelineTools() {
  const { tool, setTool, zoom, setZoom, zoomBy, fit, snap, toggleSnap } = useToolState();
  const { playhead } = useSegmentsState();
  return (
    <div id="ui-timeline-tools" className="relative flex h-[45px] shrink-0 items-center border-b border-hairline py-[4px] pl-[8px] pr-[10px] text-meta text-fg-dim">
      <div role="toolbar" aria-label="Timeline tools" className="flex">
        {TOOLS.map(({ tool: t, label, icon: IconFor }) => (
          <button
            key={t}
            type="button"
            aria-label={label}
            title={`${label} (${TOOL_KEYS[t].toUpperCase()})`}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            className={`inline-flex h-[36px] w-[40px] shrink-0 items-center justify-center rounded-control ${
              tool === t ? "bg-bg text-ice" : "text-fg-dim hover:bg-hover hover:text-fg"
            }`}
          >
            <IconFor />
          </button>
        ))}
      </div>
      <span aria-hidden="true" className="mx-[8px] h-[20px] w-px bg-hairline" />
      <button
        type="button"
        aria-pressed={snap}
        aria-label="Snap"
        title="Snap handles to the transcript. Off: move them freely, by the second."
        onClick={toggleSnap}
        className={`inline-flex h-[28px] items-center gap-[6px] rounded-[14px] border px-[10px] text-meta ${snap ? "border-ice text-ice" : "border-hairlineStrong text-fg-dim hover:bg-hover hover:text-fg"}`}
      >
        <Magnet aria-hidden="true" size={14} />
        Snap
      </button>
      <span id="ui-playhead-time" className="pointer-events-none absolute left-1/2 -translate-x-1/2 tabular-nums text-fg">
        {clockTime(playhead)}
      </span>
      <div className="ml-auto flex items-center gap-[2px]">
        <button type="button" aria-label="Zoom out" className={STEP_BUTTON} onClick={() => zoomBy(-10)}>
          −
        </button>
        <span
          role="slider"
          aria-label="Timeline zoom"
          aria-valuemin={ZOOM_MIN}
          aria-valuemax={100}
          aria-valuenow={zoom}
          tabIndex={0}
          className="relative mx-[6px] flex h-[36px] w-[96px] cursor-pointer touch-none items-center"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 25 : 10;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") setZoom(zoom + step);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setZoom(zoom - step);
            else if (e.key === "Home") setZoom(ZOOM_MIN);
            else if (e.key === "End") setZoom(100);
            else return;
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(zoomFromX(e.clientX, r.left, r.width));
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return; // only while pressed: a drag of the thumb zooms
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(zoomFromX(e.clientX, r.left, r.width));
          }}
        >
          {/* The 44 px slider is the hit area; the track stays the board's 3 px line. */}
          <span aria-hidden className="h-[3px] w-full rounded-[2px] bg-hover" />
          <span aria-hidden className="absolute top-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: `${zoomThumbPercent(zoom)}%` }} />
        </span>
        <button type="button" aria-label="Zoom in" className={STEP_BUTTON} onClick={() => zoomBy(10)}>
          +
        </button>
        <button type="button" className="inline-flex h-[36px] items-center rounded-control px-[10px] text-meta text-fg-dim hover:bg-hover hover:text-fg" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}
