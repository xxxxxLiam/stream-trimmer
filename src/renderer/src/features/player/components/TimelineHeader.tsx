/**
 * File: TimelineHeader.tsx
 * Path: src/renderer/src/features/player/components/TimelineHeader.tsx
 * Description: The timeline's header. With one range: In, Out and the clip length (the biggest
 *   number, Ice, 22px). With locked sections: the total and one chip per section in play order.
 *   On the right + section and the split Clip button.
 */
import type { TimelineController } from "../hooks/useTimelineController";
import { lengthLabel } from "../hooks/useTimelineController";
import { findOverlaps } from "../../../shared/utils/segments";
import ClipButton from "./ClipButton";

function CrossIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export default function TimelineHeader({ c }: { c: TimelineController }) {
  const chips = c.segments;
  const overlap = c.range ? findOverlaps(c.range, c.used).length > 0 : false;
  return (
    <div className="flex h-[60px] items-center gap-[16px] px-[16px]">
      {chips.length === 0 ? (
        <>
          <span id="ui-mark-in" className="text-section font-normal tabular-nums" aria-label="In">
            {c.inText}
          </span>
          <span id="ui-mark-out" className="text-section font-normal tabular-nums" aria-label="Out">
            {c.outText}
          </span>
        </>
      ) : null}
      <span id="ui-stitched-total" className="inline-flex items-baseline gap-[8px]">
        <span className="text-cliplength tabular-nums text-ice">{c.lengthText}</span>
        <span className="text-meta leading-[15px] text-fg-dim">clip length</span>
      </span>
      {overlap ? (
        <span id="ui-overlap-warning" role="status" className="text-meta text-fg-dim">
          Overlaps a clip already made
        </span>
      ) : null}
      {chips.length > 0 ? (
        <span id="ui-segment-list" className="sr-only">
          {chips.length} sections
        </span>
      ) : null}
      {chips.map((s, i) => (
        <span
          key={`${s.start}-${s.end}`}
          className="inline-flex h-[30px] items-center gap-[6px] rounded-full border border-ice-tint-50 pl-[12px] pr-[4px] text-body"
        >
          <span className="text-fg-dim">{i + 1}</span>
          <span className="tabular-nums">{lengthLabel(s.end - s.start)}</span>
          <button
            type="button"
            aria-label={`Remove section ${i + 1}`}
            disabled={c.locked}
            onClick={() => c.removeSection(i)}
            className="inline-flex size-[28px] items-center justify-center text-fg-dim hover:text-fg"
          >
            <CrossIcon />
          </button>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-[8px]">
        <button
          type="button"
          disabled={!c.range || c.locked}
          onClick={c.addSection}
          id="ui-add-segment"
          className="h-target rounded-full border border-hairlineStrong bg-raised px-[16px] text-body text-fg disabled:text-disabled"
        >
          + section
        </button>
        <ClipButton listenForKey />
      </span>
    </div>
  );
}
