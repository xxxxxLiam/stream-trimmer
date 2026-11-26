/**
 * File: SortFilterPanel.tsx
 * Path: src/renderer/src/features/clips/components/SortFilterPanel.tsx
 * Description: The bank's Sort and filter (board 03.2.52): one panel with Sort by, Topic chips, Tier T1 to
 *   T3, Rating Any / 7+ / 8+ / 9+ and Reset. Chips are 28px tall with 6px gaps; labels sit 12px above and
 *   6px below. Logic-free: the Export panel owns the view.
 */
import { useEffect, useRef, useState } from "react";
import { IconSettings } from "../../../shared/components/icons";
import { SORT_ROWS, DEFAULT_VIEW, activeFilters, type BankSortKey, type BankView } from "../utils/bankView";

const chip = (on: boolean) =>
  `inline-flex h-[28px] items-center rounded-[14px] border px-[10px] text-meta ${on ? "border-ice text-ice" : "border-hairlineStrong text-fg hover:bg-hover"}`;

function Label({ children }: { children: string }) {
  return <div className="mb-[6px] mt-[12px] text-meta text-fg-dim">{children}</div>;
}

export default function SortFilterPanel({ view, onChange, topics }: { view: BankView; onChange: (v: BankView) => void; topics: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  const box = useRef<HTMLSpanElement>(null);
  // Esc or a press outside closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  const toggle = (list: readonly string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const n = activeFilters(view);
  return (
    <span ref={box} className="relative flex">
      <button
        type="button"
        aria-label="Sort and filter"
        aria-expanded={open}
        title="Sort and filter"
        onClick={() => {
          // Never taller than the panel it opens in: it scrolls instead of being clipped.
          const bottom = box.current?.closest('[role="tabpanel"]')?.getBoundingClientRect().bottom;
          const top = box.current?.getBoundingClientRect().bottom;
          setMaxH(bottom && top ? Math.max(160, bottom - top - 12) : undefined);
          setOpen(!open);
        }}
        className={`inline-flex size-[44px] items-center justify-center rounded-full bg-raised ${n > 0 || open ? "text-fg" : "text-fg-dim hover:bg-hover hover:text-fg"}`}
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
          style={{ maxHeight: maxH }}
          className="absolute right-0 top-[46px] z-20 w-[278px] overflow-y-auto rounded-panel border border-hairlineStrong bg-raised px-[14px] pb-[14px] pt-[2px]"
        >
          <div className="mb-[6px] mt-[12px] flex items-center justify-between text-meta text-fg-dim">
            Sort by
            <button type="button" className="underline hover:text-fg" onClick={() => onChange({ ...DEFAULT_VIEW, words: view.words })}>
              Reset
            </button>
          </div>
          <div className="flex flex-col">
            {(Object.keys(SORT_ROWS) as BankSortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={view.sort === k}
                className={`flex h-[28px] items-center justify-between rounded-control px-[8px] text-left text-body text-fg ${view.sort === k ? "bg-hover" : "hover:bg-hover"}`}
                onClick={() => onChange({ ...view, sort: k })}
              >
                {SORT_ROWS[k]}
                {view.sort === k ? <span aria-hidden="true" className="text-ice">✓</span> : null}
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
        </div>
      ) : null}
    </span>
  );
}
