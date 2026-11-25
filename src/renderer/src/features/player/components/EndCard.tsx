/**
 * File: EndCard.tsx
 * Path: src/renderer/src/features/player/components/EndCard.tsx
 * Description: What the preview shows when the video reaches its end: Next video, Done for today, or
 *   Nothing waiting. All three sit in the same place over the picture.
 */
import { endCardKind } from "../utils/transport";
import type { DayState } from "../../../modules/layout/hooks/PanelHostContext";

type Props = {
  day: DayState;
  onNextVideo: () => void;
  onOpenBank: () => void;
  onOpenVideo: () => void;
};

const PRIMARY =
  "mt-3 inline-flex h-target items-center rounded-full bg-ice px-[22px] text-body font-medium text-bg";
const SECONDARY =
  "mt-3 inline-flex h-target items-center rounded-full border border-hairlineStrong bg-raised px-[22px] text-body font-medium text-fg";

export default function EndCard({ day, onNextVideo, onOpenBank, onOpenVideo }: Props) {
  const kind = endCardKind({ next: day.next, made: day.made, quota: day.quota });
  const name = day.campaignName ?? "this campaign";
  const left = day.quota !== null ? Math.max(0, day.quota - day.made) : null;
  return (
    <div
      role="status"
      className="absolute inset-[0px] flex flex-col items-center justify-center gap-[6px] bg-bg-overlay-80 px-[24px] text-center"
    >
      {kind === "done" ? (
        <div className="flex items-center gap-[6px] text-meta text-frost">
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          Done for today
        </div>
      ) : (
        <div className="text-meta text-fg-dim">Video finished</div>
      )}
      {kind === "next" && day.next ? (
        <>
          <div className="text-title">Next: {day.next.title}</div>
          <div className="text-body text-fg-dim">
            {day.next.waiting} {day.next.waiting === 1 ? "moment" : "moments"} waiting in the bank
          </div>
          <button type="button" onClick={onNextVideo} className={PRIMARY}>
            Next video
          </button>
        </>
      ) : null}
      {kind === "done" ? (
        <>
          <div className="text-title">That is all for {name} today</div>
          <div className="text-body text-fg-dim">
            {day.made} of {day.quota} made, nothing waiting in the bank
          </div>
          <button type="button" onClick={onOpenBank} className={SECONDARY}>
            Open the bank
          </button>
        </>
      ) : null}
      {kind === "nothing" ? (
        <>
          <div className="text-title">Nothing left in the bank for {name}</div>
          <div className="text-body text-fg-dim">
            {left && left > 0
              ? `${left} more ${left === 1 ? "clip is" : "clips are"} needed today. Find moments in another long video.`
              : "Find moments in another long video."}
          </div>
          <button type="button" onClick={onOpenVideo} className={PRIMARY}>
            Open a video
          </button>
        </>
      ) : null}
    </div>
  );
}
