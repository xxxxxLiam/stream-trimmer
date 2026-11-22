/**
 * File: ImportTimestamps.tsx
 * Path: src/components/ImportTimestamps.tsx
 * Description: Paste box for the clip bank (BUILD-SPEC 12b, A1). A centred dialog, not a
 *   panel in the 320px clips column: a paste is many lines wide and you have to be able to
 *   read what you pasted. Shows what was understood, a per-line error list, and the accepted
 *   shapes behind a disclosure. Nothing is stored until the user confirms.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseBankImport, type ParsedClip } from "../lib/bankImport";
import { formatLength } from "../lib/segments";

export type ImportTimestampsProps = {
  /** Source video length in seconds; ranges past it are reported. */
  duration?: number;
  /** Called once, after confirm, with the clips that were understood. */
  onImport: (clips: ParsedClip[]) => void;
  onCancel: () => void;
};

const EXAMPLES: Array<{ shape: string; text: string }> = [
  { shape: "Range, id and label", text: "T1-A01  38:43 - 39:26  the hook line here" },
  { shape: "Separators: - to → – —", text: "0:05:40 to 0:06:35" },
  { shape: "Two segments, one clip (; or +)", text: "00:01:12 to 00:01:30; 00:10:04 to 00:10:20" },
  { shape: "Seconds, hours, fractions", text: "90-120   1:12:04–1:12:38   1:00.500-1:02.250" },
  { shape: "Category and tier, written out", text: "A02 4:10-4:50 category: hook tier: 2" },
  { shape: "Category and tier, short", text: "A03 7:00-7:40 cat: payoff t: 1" },
  { shape: "In brackets or pipes", text: "A04 9:00-9:30 [hook] [T2]    A05 11:00-11:30 | hook | T2" },
  { shape: "A heading sets the category below it", text: "Hook moments:\nA06 12:00-12:40\nA07 14:00-14:30" },
  { shape: "Tier from the id: T1- means tier 1", text: "T1-A08 15:00-15:45" },
];

export default function ImportTimestamps({ duration, onImport, onCancel }: ImportTimestampsProps) {
  const [text, setText] = useState("");
  const areaId = useId();
  const titleId = useId();
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const preview = useMemo(() => parseBankImport(text, { duration }), [text, duration]);
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
            One clip per line. Paste once for this video and it stays banked.
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
              placeholder={"Ruling:\n12:04 - 12:31  can you combine these two prayers [1]\n28:50 - 29:19  is this income halal [2]"}
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
              Categories and tiers are whatever you write. If a line says more than one way, the
              explicit pair wins, then brackets or pipes, then the heading, then the id.
            </p>
          </details>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-5 py-4">
          <button
            type="button"
            className="btn"
            disabled={n === 0}
            onClick={() => onImport(preview.clips)}
          >
            {n === 0 ? "Nothing to import" : `Import ${n} ${n === 1 ? "clip" : "clips"}`}
          </button>
          <span className="min-w-0 flex-1 text-meta text-fg-dim">
            {hasInput ? "Review the list, then confirm." : "Paste above to see what it reads."}
          </span>
        </footer>
      </div>
    </div>
  );
}
