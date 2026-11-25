/**
 * File: TranscriptWait.tsx
 * Path: src/renderer/src/features/transcript/components/TranscriptWait.tsx
 * Description: What the Transcript tab shows while the transcript is on its way: a dim "Getting the
 *   transcript…" line and skeleton rows (raised 44px, a short time bar and a longer text bar in the
 *   hover colour) that pulse gently in opacity. No spinner, no shimmer sweep.
 */
const BARS = ["w-[72%]", "w-[58%]", "w-[80%]", "w-[46%]", "w-[66%]", "w-[54%]"];

export default function TranscriptWait() {
  return (
    <div>
      <p role="status" className="m-[0px] px-[14px] py-[8px] text-meta text-fg-dim">
        Getting the transcript…
      </p>
      <div aria-hidden="true" data-testid="transcript-skeleton" className="animate-pulse">
        {BARS.map((w, i) => (
          <div key={i} className="mx-[10px] mb-[6px] flex h-target items-center gap-[8px] rounded-control bg-raised px-[10px]">
            <span className="h-[8px] w-[36px] flex-none rounded-chip bg-hover" />
            <span className={"h-[8px] rounded-chip bg-hover " + w} />
          </div>
        ))}
      </div>
    </div>
  );
}
