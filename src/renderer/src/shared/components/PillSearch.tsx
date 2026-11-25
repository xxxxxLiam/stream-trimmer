/**
 * File: PillSearch.tsx
 * Path: src/renderer/src/shared/components/PillSearch.tsx
 * Description: The pill search from the workspace board: a 44px rounded field, Enter turns the
 *   typed words into a pill, pills combine, "Clear filters" empties them, and a quiet count sits
 *   underneath. Used by History (and the Videos list).
 */
import { useState } from "react";
import { IconClose, IconSearch } from "./rowIcons";

export type PillSearchProps = {
  placeholder: string;
  pills: readonly string[];
  onPillsChange: (pills: string[]) => void;
  /** The quiet line under the pills, e.g. "12 clips". */
  count: string;
};

export default function PillSearch({ placeholder, pills, onPillsChange, count }: PillSearchProps) {
  const [text, setText] = useState("");

  const commit = () => {
    const word = text.trim();
    if (!word) return;
    if (!pills.some((p) => p.toLowerCase() === word.toLowerCase())) onPillsChange([...pills, word]);
    setText("");
  };

  return (
    <div className="flex flex-none flex-col">
      <label
        role="search"
        className="mx-[10px] mb-[6px] mt-[10px] flex h-[44px] items-center gap-[8px] rounded-[22px] bg-raised px-[14px] text-body text-fg-dim"
      >
        <IconSearch />
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !text && pills.length) {
              onPillsChange(pills.slice(0, -1));
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-dim"
        />
      </label>
      {pills.length > 0 && (
        <div className="-mt-[6px] flex items-center px-[12px]">
          <div className="flex flex-wrap items-center">
            {pills.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={`Remove filter ${p}`}
                onClick={() => onPillsChange(pills.filter((x) => x !== p))}
                className="inline-flex h-[44px] items-center"
              >
                <span className="inline-flex h-[28px] items-center gap-[4px] rounded-[14px] border border-hairlineStrong bg-raised pl-[12px] pr-[6px] text-meta leading-[normal] text-fg">
                  {p}
                  <span className="inline-flex w-[18px] justify-center text-fg-dim">
                    <IconClose />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onPillsChange([])} className="ml-auto h-[44px] text-meta leading-[normal] text-fg">
            Clear filters
          </button>
        </div>
      )}
      <div role="status" className="px-[14px] pb-[2px] text-meta leading-[normal] text-fg-dim">
        {count}
      </div>
    </div>
  );
}
