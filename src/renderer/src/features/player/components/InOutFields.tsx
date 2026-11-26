/**
 * File: InOutFields.tsx
 * Path: src/renderer/src/features/player/components/InOutFields.tsx
 * Description: In and Out in the footer, as two 32px fields you can type or paste a time into. A valid pair is
 *   the range on the timeline (the same as dragging one); dragging, or I and O at the playhead, rewrites the
 *   fields. A wrong entry gets a 1px error border and one sentence; nothing else about the bar changes.
 */
import { useState } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { parseTimestamp } from "../../../shared/utils/clip";
import { clockTimePrecise } from "../utils/transport";
import { OUT_AFTER_IN, outBeforeIn, readTime } from "../utils/inOutFields";

const FIELD =
  "h-[32px] w-[84px] rounded-control border bg-raised px-[10px] text-center text-body tabular-nums text-fg outline-none placeholder:text-fg-dim focus:border-hairlineStrong";

function Field({
  id,
  label,
  text,
  setText,
  duration,
  flagged,
  onProblem,
}: {
  id: string;
  label: "In" | "Out";
  text: string;
  setText: (v: string) => void;
  duration: number;
  flagged: boolean;
  onProblem: (message: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = parseTimestamp(text);
  const shown = draft ?? (parsed === null ? "" : clockTimePrecise(parsed));
  const commit = (value: string) => {
    const r = readTime(value, duration);
    if (r.kind === "bad") {
      onProblem(r.message);
      return false;
    }
    onProblem("");
    setText(r.kind === "set" ? r.text : "");
    setDraft(null);
    return true;
  };
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      aria-invalid={flagged || undefined}
      placeholder={label}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onPaste={(e) => {
        // A pasted time is taken at once: no need to press Enter.
        const pasted = e.clipboardData.getData("text");
        if (readTime(pasted, duration).kind === "set") {
          e.preventDefault();
          commit(pasted);
        }
      }}
      onBlur={() => {
        if (draft !== null && !commit(draft)) setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (draft !== null) commit(draft);
        } else if (e.key === "Escape" && draft !== null) {
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
          onProblem("");
        }
      }}
      className={`${FIELD} ${flagged ? "border-error" : "border-hairlineStrong"}`}
    />
  );
}

export default function InOutFields() {
  const { startText, endText, setStartText, setEndText, duration } = useClipperContext();
  const [problem, setProblem] = useState("");
  const wrongWay = outBeforeIn(startText, endText);
  const sentence = problem || (wrongWay ? OUT_AFTER_IN : "");
  return (
    <span className="inline-flex items-center gap-[8px]">
      <Field id="ui-mark-in" label="In" text={startText} setText={setStartText} duration={duration} flagged={!!problem || wrongWay} onProblem={setProblem} />
      <span aria-hidden="true" className="text-fg-dim">–</span>
      <Field id="ui-mark-out" label="Out" text={endText} setText={setEndText} duration={duration} flagged={!!problem || wrongWay} onProblem={setProblem} />
      {sentence ? (
        <span role="alert" className="text-meta text-error">
          {sentence}
        </span>
      ) : null}
    </span>
  );
}
