/**
 * File: SortFilterPanel.tsx
 * Path: src/renderer/src/features/clips/components/SortFilterPanel.tsx
 * Description: The bank's Sort and filter (board 03.2.52): one panel with Sort by, Topic chips, Tier T1 to
 *   T3, Rating Any / 7+ / 8+ / 9+ and Reset. Chips are 28px tall with 6px gaps; labels sit 12px above and
 *   6px below. Logic-free: the Export panel owns the view.
 */
import { useState } from "react";
import { IconSettings } from "../../../shared/components/icons";
import { SORT_LABELS, DEFAULT_VIEW, activeFilters, type BankSortKey, type BankView } from "../utils/bankView";

const chip = (on: boolean) =>
  `inline-flex h-[28px] items-center rounded-[14px] border px-[10px] text-meta ${on ? "border-hairlineStrong bg-hover text-fg" : "border-hairline text-fg-dim hover:bg-hover hover:text-fg"}`;

function Label({ children }: { children: string }) {
  return <div className="mb-[6px] mt-[12px] text-meta text-fg-dim">{children}</div>;
}

export default function SortFilterPanel({ view, onChange, topics }: { view: BankView; onChange: (v: BankView) => void; topics: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const toggle = (list: readonly string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const n = activeFilters(view);
  return (
    <span className="relative">
      <button
        type="button"
        aria-label="Sort and filter"
        aria-expanded={open}
        title="Sort and filter"
        onClick={() => setOpen(!open)}
        className={`inline-flex size-[44px] items-center justify-center rounded-full ${n > 0 || open ? "bg-hover text-fg" : "text-fg-dim hover:bg-hover hover:text-fg"}`}
      >
        <IconSettings />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Sort and filter"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="absolute right-0 top-[48px] z-20 w-[272px] rounded-panel border border-hairlineStrong bg-raised px-[14px] pb-[14px] pt-[2px]"
        >
          <Label>Sort by</Label>
          <div className="flex flex-wrap gap-[6px]">
            {(Object.keys(SORT_LABELS) as BankSortKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={view.sort === k} className={chip(view.sort === k)} onClick={() => onChange({ ...view, sort: k })}>
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>
          {topics.length > 0 ? (
            <>
              <Label>Topic</Label>
              <div className="flex flex-wrap gap-[6px]">
                {topics.map((t) => (
                  <button key={t} type="button" aria-pressed={view.topics.includes(t)} className={chip(view.topics.includes(t))} onClick={() => onChange({ ...view, topics: toggle(view.topics, t) })}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <Label>Tier</Label>
          <div className="flex flex-wrap gap-[6px]">
            {["1", "2", "3"].map((t) => (
              <button key={t} type="button" aria-pressed={view.tiers.includes(t)} className={chip(view.tiers.includes(t))} onClick={() => onChange({ ...view, tiers: toggle(view.tiers, t) })}>
                T{t}
              </button>
            ))}
          </div>
          <Label>Rating</Label>
          <div className="flex flex-wrap gap-[6px]">
            {[0, 7, 8, 9].map((r) => (
              <button key={r} type="button" aria-pressed={view.minRating === r} className={chip(view.minRating === r)} onClick={() => onChange({ ...view, minRating: r })}>
                {r === 0 ? "Any" : `${r}+`}
              </button>
            ))}
          </div>
          <div className="mt-[12px] flex justify-end">
            <button type="button" className="text-meta text-fg-dim underline hover:text-fg" onClick={() => onChange({ ...DEFAULT_VIEW, words: view.words })}>
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
