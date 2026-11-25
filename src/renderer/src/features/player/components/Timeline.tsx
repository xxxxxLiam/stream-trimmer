/**
 * File: Timeline.tsx
 * Path: src/renderer/src/features/player/components/Timeline.tsx
 * Description: The timeline panel: header, ruler and the three lanes (Transcript, Source, Clips),
 *   full width under the preview. The tools and zoom come from the bottom bar's shared state.
 */
import { useLayoutEffect, useRef } from "react";
import { useTimelineController } from "../hooks/useTimelineController";
import { useTranscriptLane } from "../hooks/useTranscriptLane";
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

  useLayoutEffect(() => {
    const el = laneBox.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(0, el.clientWidth - LABEL_WIDTH));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setWidth]);

  return (
    <div id="ui-timeline" ref={laneBox} className="relative flex min-w-[0px] flex-1 flex-col border-y border-hairline bg-panel pb-[10px]">
      <TimelineHeader c={c} />
      <TimelineRuler c={c} />
      {transcriptLane ? <TranscriptLane c={c} /> : null}
      <SourceLane c={c} />
      <ClipsLane c={c} />
      {c.folded && c.fold[0] ? (
        <div className="absolute bottom-[8px] right-[16px] text-meta text-fg-dim">Zoom: 52 s each side of the fold</div>
      ) : null}
    </div>
  );
}
