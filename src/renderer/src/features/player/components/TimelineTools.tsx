/**
 * File: TimelineTools.tsx
 * Path: src/renderer/src/features/player/components/TimelineTools.tsx
 * Description: The 44px row at the top of the timeline panel: the six tools on the left, zoom with Fit on
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
import { TOOL_KEYS, useToolState, type TimelineTool } from "../../../modules/layout/hooks/useToolState";

const TOOLS: { tool: TimelineTool; label: string; icon: () => ReactElement }[] = [
  { tool: "pointer", label: "Pointer", icon: IconPointer },
  { tool: "clip", label: "Scissors", icon: IconScissors },
  { tool: "range", label: "Select range", icon: IconRange },
  { tool: "flag", label: "Flag tool", icon: IconFlag },
  { tool: "hand", label: "Hand", icon: IconHand },
  { tool: "zoom", label: "Zoom tool", icon: IconZoomTool },
];

const STEP_BUTTON = "inline-flex h-[44px] w-[32px] items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg";

export default function TimelineTools() {
  const { tool, setTool, zoom, setZoom, zoomBy, fit } = useToolState();
  return (
    <div id="ui-timeline-tools" className="flex h-[44px] shrink-0 items-center border-b border-hairline px-[7px] text-meta text-fg-dim">
      <div role="toolbar" aria-label="Timeline tools" className="flex">
        {TOOLS.map(({ tool: t, label, icon: IconFor }) => (
          <button
            key={t}
            type="button"
            aria-label={label}
            title={`${label} (${TOOL_KEYS[t].toUpperCase()})`}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            className={`inline-flex h-[44px] w-[40px] shrink-0 items-center justify-center rounded-control ${
              tool === t ? "bg-bg text-ice" : "text-fg-dim hover:bg-hover hover:text-fg"
            }`}
          >
            <IconFor />
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-[2px]">
        <button type="button" aria-label="Zoom out" className={STEP_BUTTON} onClick={() => zoomBy(-10)}>
          −
        </button>
        <span
          role="slider"
          aria-label="Timeline zoom"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={zoom}
          tabIndex={0}
          className="relative mx-[6px] h-[3px] w-[96px] rounded-[2px] bg-hover"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 25 : 10;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") setZoom(zoom + step);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setZoom(zoom - step);
            else if (e.key === "Home") setZoom(0);
            else if (e.key === "End") setZoom(100);
            else return;
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(((e.clientX - r.left) / r.width) * 100);
          }}
        >
          <span aria-hidden className="absolute -top-[5px] size-[13px] -translate-x-1/2 rounded-full bg-fg" style={{ left: `${zoom}%` }} />
        </span>
        <button type="button" aria-label="Zoom in" className={STEP_BUTTON} onClick={() => zoomBy(10)}>
          +
        </button>
        <button type="button" className="inline-flex h-[44px] items-center rounded-control px-[10px] text-meta text-fg-dim hover:bg-hover hover:text-fg" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}
