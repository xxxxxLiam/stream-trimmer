/**
 * File: SearchPill.tsx
 * Path: src/renderer/src/shared/components/SearchPill.tsx
 * Description: The pill search field of the Videos and Transcript panels: 44px, 22px radius, raised
 *   fill, a search glyph, fg-dim placeholder and a clear button once there is text. Native search
 *   cancel button is hidden in styles.css; the clear button is ours so it has a name.
 */
import type { ReactNode } from "react";

export type SearchPillProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon: ReactNode;
  clearIcon: ReactNode;
};

export default function SearchPill({ label, value, onChange, placeholder, icon, clearIcon }: SearchPillProps) {
  return (
    <label className="flex h-target items-center gap-2 rounded-pill border border-hairline bg-raised pl-3.5 pr-1.5 text-fg-dim focus-within:border-hairlineStrong has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-frost">
      <span aria-hidden="true" className="inline-flex">{icon}</span>
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange("")}
          className="inline-flex size-9 items-center justify-center rounded-full hover:bg-hover"
        >
          {clearIcon}
        </button>
      ) : null}
    </label>
  );
}
