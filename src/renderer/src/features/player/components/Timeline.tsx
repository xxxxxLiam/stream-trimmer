/**
 * File: Timeline.tsx
 * Path: src/renderer/src/features/player/components/Timeline.tsx
 * Description: The timeline panel: header, ruler and the lanes (Transcript, Source, one Audio lane per ticked language, Clips),
 *   full width under the preview. The tools and zoom come from the bottom bar's shared state.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTimelineController } from "../hooks/useTimelineController";
import { TOOL_CURSORS, sourceLaneHeight } from "../utils/laneTools";
import { useTranscriptLane } from "../hooks/useTranscriptLane";
import AudioLanes from "./AudioLanes";
import ClipsLane from "./ClipsLane";
import SourceLane from "./SourceLane";
import TimelineHeader from "./TimelineHeader";
import TimelineRuler from "./TimelineRuler";
import TranscriptLane from "./TranscriptLane";

const LABEL_WIDTH = 96;

export default function Timeline() {
  const c = useTimelineController();
  const laneBox = useRef<HTMLDivElement>(null);
  const transcriptLane = useTranscriptLane();
  const { setWidth } = c;
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = laneBox.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(0, el.clientWidth - LABEL_WIDTH));
      setHeight(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setWidth, setHeight]);

  // A native listener over the whole timeline: React's wheel handler is passive and cannot keep the page
  // from scrolling or zooming, and a trackpad pinch (Ctrl + wheel) must work wherever the pointer is.
  const onWheel = c.onLaneWheel;
  useEffect(() => {
    const el = laneBox.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (onWheel(e, el.getBoundingClientRect().left + LABEL_WIDTH)) e.preventDefault();
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  });

  return (
    <div id="ui-timeline" ref={laneBox} className={`relative flex min-w-[0px] flex-1 flex-col border-y border-hairline bg-panel pb-[10px]`}>
      <TimelineHeader c={c} />
      {/* The tools act on this whole area, down to the empty space under the tracks. */}
      <div
        data-timeline-area
        className={`relative flex min-h-[0px] flex-1 touch-none select-none flex-col ${TOOL_CURSORS[c.tool]}`}
        onPointerDown={c.onLanePointerDown}
        onPointerMove={c.onLanePointerMove}
        onPointerUp={c.onLanePointerUp}
      >
        <TimelineRuler c={c} />
        {transcriptLane ? <TranscriptLane c={c} /> : null}
        <SourceLane c={c} height={sourceLaneHeight(height)} />
        <AudioLanes c={c} />
        <ClipsLane c={c} />
      </div>
      {c.folded && c.fold[0] ? (
        <div className="absolute bottom-[8px] right-[16px] text-meta text-fg-dim">Zoom: 52 s each side of the fold</div>
      ) : null}
    </div>
  );
}
