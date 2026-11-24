/**
 * File: ColumnToggle.tsx
 * Path: src/renderer/src/modules/layout/components/ColumnToggle.tsx
 * Description: Hide / show for one side workspace column. Two forms of ONE button, never
 *   both at once, sharing an id so focus can follow the toggle: a small pill on the
 *   divider while the column is shown ("Hide transcript"), and a slim labelled rail where
 *   the column was once it is hidden ("Show transcript"). The rail names what it reopens.
 */
import type { ColumnKind } from "../utils/columnSizes";

const NAME: Record<ColumnKind, string> = { transcript: "Transcript", clips: "Clips" };

export const toggleId = (kind: ColumnKind) => `ui-toggle-${kind}`;

export type ColumnToggleProps = {
  kind: ColumnKind;
  /** True while the column is collapsed (the rail form). */
  collapsed: boolean;
  onToggle: () => void;
};

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d={dir === "left" ? "M7 1 3 5l4 4" : "M3 1l4 4-4 4"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ColumnToggle({ kind, collapsed, onToggle }: ColumnToggleProps) {
  const lower = NAME[kind].toLowerCase();
  const target = `ui-col-${kind}`;
  if (!collapsed) {
    return (
      <button
        type="button"
        id={toggleId(kind)}
        aria-expanded={true}
        aria-controls={target}
        aria-label={`Hide ${lower}`}
        title={`Hide ${lower}`}
        className={`col-pill col-pill-${kind}`}
        onClick={onToggle}
      >
        <Chevron dir={kind === "transcript" ? "left" : "right"} />
      </button>
    );
  }
  return (
    <button
      type="button"
      id={toggleId(kind)}
      aria-expanded={false}
      aria-controls={target}
      aria-label={`Show ${lower}`}
      title={`Show ${lower}`}
      className={`col-rail col-rail-${kind} surface-panel`}
      onClick={onToggle}
    >
      <Chevron dir={kind === "transcript" ? "right" : "left"} />
      <span className="col-rail-label">{NAME[kind]}</span>
    </button>
  );
}
