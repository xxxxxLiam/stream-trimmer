/**
 * File: Timeline.tsx
 * Path: src/components/Timeline.tsx
 * Description: Centre column, under the video. Phase A stub: hosts the legacy range controls.
 */
import TimeRangeControls from "./TimeRangeControls";

export type TimelineProps = { className?: string };

// TODO(B2): replaced by segments UI agent (numbered segment blocks, used-range hatch).
export default function Timeline({ className }: TimelineProps) {
  return (
    <div className={`surface-panel p-4 ${className ?? ""}`}>
      <TimeRangeControls />
    </div>
  );
}
