/**
 * File: ImportTimestamps.tsx
 * Path: src/components/ImportTimestamps.tsx
 * Description: Paste box for the clip bank (BUILD-SPEC 12b, A1). Shows a worked example of
 *   every accepted shape, a live preview of what was understood, and a per-line error list.
 *   Nothing is stored until the user confirms.
 */
import { useId, useMemo, useState } from "react";
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
  const preview = useMemo(() => parseBankImport(text, { duration }), [text, duration]);
  const hasInput = text.trim().length > 0;
  const n = preview.clipCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" aria-label="Import timestamps">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-section font-medium text-fg">Import timestamps</h2>
        <button type="button" className="chip" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-meta text-fg-dim">
        One clip per line. Paste once for this video and it stays banked.
      </p>

      <label htmlFor={areaId} className="sr-only">
        Timestamps, one clip per line
      </label>
      <textarea
        id={areaId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder="Paste your timestamps here"
        className="w-full resize-y rounded-control border bg-raised p-3 font-mono text-body text-fg outline-none focus-visible:border-accent"
        style={{ borderColor: "var(--c-hairline)", fontVariantNumeric: "tabular-nums" }}
      />

      {hasInput && (
        <section aria-label="What was understood" className="flex flex-col gap-2">
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
                    <span className="font-mono text-fg" style={{ fontVariantNumeric: "tabular-nums" }}>
                      Line {e.line}
                    </span>
                    <span className="text-fg-dim"> {e.reason}</span>
                    <span className="block truncate font-mono text-fg-dim">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={n === 0}
              onClick={() => onImport(preview.clips)}
            >
              {n === 0 ? "Nothing to import" : `Import ${n} ${n === 1 ? "clip" : "clips"}`}
            </button>
            <span className="text-meta text-fg-dim">Review the list, then confirm.</span>
          </div>
        </section>
      )}

      <section aria-label="Accepted shapes" className="flex flex-col gap-2">
        <h3 className="text-body font-medium text-fg">Accepted shapes</h3>
        <ul className="flex flex-col gap-2">
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
        <p className="text-meta text-fg-dim">
          Categories and tiers are whatever you write. If a line says more than one way, the
          explicit pair wins, then brackets or pipes, then the heading, then the id.
        </p>
      </section>
    </div>
  );
}
