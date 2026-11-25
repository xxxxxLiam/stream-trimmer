/**
 * File: FinalCutLayout.tsx
 * Path: src/renderer/src/features/settings/components/FinalCutLayout.tsx
 * Description: The "Layout" row in a campaign's Final Cut fields: shows the chosen template, opens the short
 *   list (name and one line each), and previews the result as a small tree built from the campaign's real
 *   names. Logic-free. Built with the shared parts until Design's drawing lands.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { FcpLayout } from "../../../shared/utils/fcpxml";
import type { LayoutOption, TreeLine } from "../utils/importLayouts";

export type FinalCutLayoutProps = {
  options: LayoutOption[];
  current: FcpLayout;
  open: boolean;
  onToggleOpen: () => void;
  onPick: (id: FcpLayout) => void;
  /** The tree for the chosen layout. */
  tree: TreeLine[];
};

export default function FinalCutLayout(p: FinalCutLayoutProps) {
  const current = p.options.find((o) => o.id === p.current);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wasOpen = useRef(false);

  // Opening puts focus on the chosen layout; closing gives it back to the row's button.
  useEffect(() => {
    if (p.open) list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = p.open;
  }, [p.open]);

  // Arrows, Home and End move through the list; Esc closes only the list, never the Settings drawer under it.
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      p.onToggleOpen();
      return;
    }
    const to = e.key === "ArrowDown" ? (at + 1) % items.length : e.key === "ArrowUp" ? (at - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (to >= 0) {
      e.preventDefault();
      items[to]?.focus();
    }
  };
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="text-meta text-fg-dim">Layout</span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={p.open}
        onClick={p.onToggleOpen}
        className="flex h-target items-center gap-[8px] rounded-control border border-hairlineStrong bg-panel px-[12px] text-left text-body leading-[normal] text-fg"
      >
        <span className="flex-1 truncate">{current?.name}</span>
        <span aria-hidden="true" className="text-fg-dim">▾</span>
      </button>
      {p.open && (
        <ul ref={list} onKeyDown={onListKey} role="listbox" aria-label="Layouts" className="m-[0px] flex list-none flex-col rounded-control border border-hairlineStrong bg-panel p-[4px]">
          {p.options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={o.id === p.current}
                tabIndex={o.id === p.current ? 0 : -1}
                onClick={() => p.onPick(o.id)}
                className="flex min-h-target w-full items-start gap-[8px] rounded-control px-[8px] py-[8px] text-left hover:bg-hover"
              >
                <span className="w-[14px] text-ice">{o.id === p.current ? "✓" : ""}</span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-body leading-[normal] text-fg">{o.name}</span>
                  <span className="text-meta leading-[normal] text-fg-dim">{o.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && <p className="m-[0px] text-meta text-fg-dim">{current.blurb}</p>}
      <ul aria-label="How it looks in Final Cut" className="m-[0px] flex list-none flex-col gap-[2px] rounded-control border border-hairline bg-panel p-[8px]">
        {p.tree.map((l, i) => (
          <li key={i} className="flex items-baseline gap-[8px] text-meta leading-[normal]" style={{ paddingLeft: `${l.depth * 16}px` }}>
            <span className="truncate text-fg">{l.label}</span>
            <span className="shrink-0 text-fg-dim">{l.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
