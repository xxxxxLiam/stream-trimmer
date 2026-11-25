/**
 * File: FinalCutTimeline.tsx
 * Path: src/renderer/src/features/settings/components/FinalCutTimeline.tsx
 * Description: The "Timeline" switch under Your look on the Final Cut page: the shape of the project Clipr
 *   makes. Vertical 9:16 is the default; Same as video; From your look, greyed until a look is chosen and
 *   switched on by itself when one is uploaded. One line says what you get, and a note says Clipr never crops.
 */
import { VERTICAL_SIZE, type TimelineKind } from "../../../shared/utils/fcpxml";

export type FinalCutTimelineProps = {
  kind: TimelineKind;
  /** The chosen look's name, or "" when none is chosen (which greys "From your look"). */
  lookName: string;
  /** The look's own size and rate once read, else null. */
  lookFormat: { width: number; height: number; fps: string } | null;
  onPick: (kind: "vertical" | "source" | "look") => void;
};

const CHOICES: { id: "vertical" | "source" | "look"; label: string }[] = [
  { id: "vertical", label: "Vertical 9:16" },
  { id: "source", label: "Same as video" },
  { id: "look", label: "From your look" },
];

/** What the timeline is, in plain words, for the line under the switch. */
export function timelineLine(p: Pick<FinalCutTimelineProps, "kind" | "lookName" | "lookFormat">): string {
  const on = p.kind === "look" && p.lookName ? "look" : p.kind === "source" ? "source" : "vertical";
  if (on === "look") {
    const f = p.lookFormat;
    return f ? `${f.width} × ${f.height} · ${f.fps}p, from ${p.lookName}.` : `The size and frame rate of ${p.lookName}.`;
  }
  if (on === "source") return "The video's own size and frame rate.";
  return `${VERTICAL_SIZE.width} × ${VERTICAL_SIZE.height}. Frame rate follows the video. ${p.lookName ? "" : "Upload a look to use its timeline instead."}`.trim();
}

export default function FinalCutTimeline(p: FinalCutTimelineProps) {
  // A look-based choice with no look left falls back to vertical, as the project does.
  const shown = p.kind === "look" && !p.lookName ? "vertical" : p.kind === "custom" ? "vertical" : p.kind;
  return (
    <div className="flex flex-col gap-[8px]">
      <span id="fcp-timeline-label" className="text-meta text-fg-dim">Timeline</span>
      <div role="radiogroup" aria-labelledby="fcp-timeline-label" className="flex gap-[8px]">
        {CHOICES.map((c) => {
          const on = shown === c.id;
          const blocked = c.id === "look" && !p.lookName;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={blocked || undefined}
              onClick={blocked ? undefined : () => p.onPick(c.id)}
              className={`h-target flex-1 rounded-control px-[8px] text-body leading-[normal] ${
                blocked ? "cursor-not-allowed border border-hairline bg-raised text-disabled" : on ? "bg-ice text-bg" : "border border-hairlineStrong bg-raised text-fg"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="m-[0px] text-meta text-fg-dim">{timelineLine({ kind: shown, lookName: p.lookName, lookFormat: p.lookFormat })}</p>
      <p className="m-[0px] text-meta text-fg-dim">Clipr never crops: a wide video sits in the middle of a vertical timeline, and your look's zoom fills it.</p>
    </div>
  );
}
