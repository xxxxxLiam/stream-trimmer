/**
 * File: ImportTimestamps.tsx
 * Path: src/renderer/src/features/clips/components/ImportTimestamps.tsx
 * Description: Paste box for the clip bank (BUILD-SPEC 12b, A1). A centred dialog, not a
 *   panel in the 320px clips column: a paste is many lines wide and you have to be able to
 *   read what you pasted. Shows what was understood, a per-line error list, and the accepted
 *   shapes behind a disclosure. Every clip needs a two word name that nothing else uses;
 *   until the names are right the import is blocked. Nothing is stored until the user confirms.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseBankImport, type ParsedClip } from "../../../shared/utils/bankImport";
import { checkNames } from "../utils/clipName";
import { formatLength } from "../../../shared/utils/segments";

export type ImportTimestampsProps = {
  /** Source video length in seconds; ranges past it are reported. */
  duration?: number;
  /** Clips already in the bank, so a repeated name is found before anything is imported. */
  existing?: ReadonlyArray<{ id: string; name: string }>;
  /** Called once, after confirm, with the clips that were understood. */
  onImport: (clips: ParsedClip[]) => void;
  onCancel: () => void;
};

const NO_EXISTING: ReadonlyArray<{ id: string; name: string }> = [];

const EXAMPLES: Array<{ shape: string; text: string }> = [
  { shape: "Range, id and name", text: "T1-A01  38:43 - 39:26  Hook Line" },
  { shape: "Separators: - to → – —", text: "0:05:40 to 0:06:35  Money Mindset" },
  { shape: "Two segments, one clip (; or +)", text: "00:01:12 to 00:01:30; 00:10:04 to 00:10:20  Combined Prayers" },
  { shape: "Seconds, hours, fractions", text: "90-120  Quick Win\n1:12:04–1:12:38  Long Wait\n1:00.500-1:02.250  Half Second" },
  { shape: "Category and tier, written out", text: "A02 4:10-4:50 Real Hook category: hook tier: 2" },
  { shape: "Category and tier, short", text: "A03 7:00-7:40 Big Payoff cat: payoff t: 1" },
  { shape: "In brackets or pipes", text: "A04 9:00-9:30 Cold Open [hook] [T2]\nA05 11:00-11:30 Warm Close | hook | T2" },
  { shape: "A heading sets the category below it", text: "Hook moments:\nA06 12:00-12:40 Sharp Start\nA07 14:00-14:30 Quiet End" },
  { shape: "Tier from the id: T1- means tier 1", text: "T1-A08 15:00-15:45 Final Push" },
];

export default function ImportTimestamps({
  duration,
  existing = NO_EXISTING,
  onImport,
  onCancel,
}: ImportTimestampsProps) {
  const [text, setText] = useState("");
  const areaId = useId();
  const titleId = useId();
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const preview = useMemo(() => parseBankImport(text, { duration }), [text, duration]);
  const nameProblems = useMemo(
    () => checkNames(preview.clips, existing),
    [preview.clips, existing],
  );
  const blocked = nameProblems.length > 0;
  const hasInput = text.trim().length > 0;
  const n = preview.clipCount;
  const lineCount = text ? text.split(/\r\n|\r|\n/).filter((l) => l.trim()).length : 0;

  // The paste is the task, so the caret starts in the box.
  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  // Esc leaves without importing. Nothing has been stored at this point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-panel flex max-h-[86vh] w-full max-w-[860px] flex-col rounded-panel border border-hairline shadow-drawer"
      >
        <header className="flex shrink-0 items-baseline gap-3 border-b border-hairline px-5 py-4">
          <h2 id={titleId} className="text-section font-medium text-fg">
            Import timestamps
          </h2>
          <p className="min-w-0 flex-1 truncate text-meta text-fg-dim">
            One clip per line, each with its own two word name. Paste once for this video and it stays banked.
          </p>
          <button type="button" className="chip shrink-0" onClick={onCancel}>
            Cancel
          </button>
        </header>

        {/* tabIndex so everything inside stays reachable by keyboard with the bar hidden. */}
        <div
          tabIndex={0}
          aria-label="Import timestamps, scrollable"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4"
        >
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={areaId} className="text-body font-medium text-fg">
                Your timestamps
              </label>
              <span className="text-meta text-fg-dim" aria-live="polite">
                {lineCount > 0 ? `${lineCount} ${lineCount === 1 ? "line" : "lines"}` : "nothing pasted yet"}
              </span>
            </div>
            <textarea
              id={areaId}
              ref={areaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={"Ruling:\n12:04 - 12:31  Combined Prayers [1]\n28:50 - 29:19  Income Halal [2]"}
              className="w-full shrink-0 resize-y rounded-control border bg-raised p-3 font-mono text-body leading-relaxed text-fg outline-none focus-visible:border-accent"
              style={{
                borderColor: "var(--c-hairline)",
                fontVariantNumeric: "tabular-nums",
                minHeight: "15rem",
              }}
            />
          </div>

          {hasInput && (
            <section aria-label="What was understood" className="flex shrink-0 flex-col gap-2">
              <p className="text-body text-fg" aria-live="polite">
                {n} {n === 1 ? "clip" : "clips"}, {preview.segmentCount}{" "}
                {preview.segmentCount === 1 ? "segment" : "segments"},{" "}
                <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatLength(preview.totalSec)}
                </span>{" "}
                in total
              </p>
              <p className="text-meta text-fg-dim">
                {preview.withCategory} with a category, {preview.withoutCategory} without
                {preview.withTier > 0 ? `. ${preview.withTier} with a tier` : ""}
              </p>
              {(preview.categories.length > 0 || preview.tiers.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {preview.categories.map((c) => (
                    <span key={`c-${c}`} className="chip">
                      {c}
                    </span>
                  ))}
                  {preview.tiers.map((t) => (
                    <span key={`t-${t}`} className="chip">
                      Tier {t}
                    </span>
                  ))}
                </div>
              )}
              {blocked && (
                <div
                  role="alert"
                  className="rounded-control border border-accent bg-accent-card p-3 shadow-accent-card"
                >
                  <p className="text-body font-medium text-accent">
                    {nameProblems.length} {nameProblems.length === 1 ? "name needs" : "names need"} fixing
                    before you can import.
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {nameProblems.map((p) => (
                      <li key={p.line} className="text-meta">
                        <span className="font-mono text-fg" style={{ fontVariantNumeric: "tabular-nums" }}>
                          Line {p.line}
                        </span>
                        <span className="text-fg-dim"> {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.errors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-control border border-accent bg-accent-card p-3 shadow-accent-card"
                >
                  <p className="text-body font-medium text-accent">
                    {preview.errors.length} {preview.errors.length === 1 ? "line" : "lines"} not
                    understood. They will be skipped.
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {preview.errors.map((e) => (
                      <li key={e.line} className="text-meta">
                        <span
                          className="font-mono text-fg"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          Line {e.line}
                        </span>
                        <span className="text-fg-dim"> {e.reason}</span>
                        <span className="block truncate font-mono text-fg-dim">{e.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Closed by default. The parser is forgiving and the preview above teaches far
              better than a grammar does, so the grammar is here for the one person who
              wants it rather than in front of the nine who do not. */}
          <details className="shrink-0">
            <summary className="cursor-pointer text-body text-fg-dim">
              What else can I paste?
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <li key={ex.shape} className="flex flex-col gap-1">
                  <span className="text-meta text-fg-dim">{ex.shape}</span>
                  <pre
                    className="m-0 overflow-x-auto rounded-control border bg-raised px-3 py-2 font-mono text-meta text-fg"
                    style={{ borderColor: "var(--c-hairline)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {ex.text}
                  </pre>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-meta text-fg-dim">
              A name is exactly two words, letters and numbers only, and no two clips share one. It
              becomes the file name and the Final Cut project name. Categories and tiers are whatever
              you write. If a line says more than one way, the explicit pair wins, then brackets or
              pipes, then the heading, then the id.
            </p>
          </details>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-5 py-4">
          <button
            type="button"
            className="btn"
            disabled={n === 0 || blocked}
            onClick={() => onImport(preview.clips)}
          >
            {n === 0
              ? "Nothing to import"
              : blocked
                ? `Fix ${nameProblems.length} ${nameProblems.length === 1 ? "name" : "names"} first`
                : `Import ${n} ${n === 1 ? "clip" : "clips"}`}
          </button>
          <span className="min-w-0 flex-1 text-meta text-fg-dim">
            {hasInput ? "Review the list, then confirm." : "Paste above to see what it reads."}
          </span>
        </footer>
      </div>
    </div>
  );
}
