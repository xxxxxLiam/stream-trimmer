/**
 * File: PanelTabStrip.tsx
 * Path: src/renderer/src/modules/layout/components/PanelTabStrip.tsx
 * Description: A group's Premiere-style tab strip: tabs that scroll sideways with no scrollbar
 *   when there are too many, a fade on any side with hidden tabs, the selected tab kept in view,
 *   and "+" and a menu pinned at the right. Keys on a focused tab: arrows move, Home/End jump,
 *   Delete closes, Alt+arrows reorder.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconMore, IconPlus } from "./BarIcons";
import PopoverMenu, { type MenuItem } from "./PopoverMenu";
import type { PanelDefinition, PanelId } from "../utils/panelRegistry";

export const tabDomId = (id: PanelId) => `panel-tab-${id}`;
export const panelBodyDomId = (id: PanelId) => `panel-body-${id}`;

const STRIP_BUTTON = "inline-flex h-[44px] w-[36px] items-center justify-center rounded-control text-fg-dim hover:text-fg";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type PanelTabStripProps = {
  /** Names the strip for screen readers, e.g. "Left panels". */
  label: string;
  tabs: PanelDefinition[];
  active: PanelId | null;
  onActivate: (id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onMove: (id: PanelId, by: -1 | 1) => void;
  /** Closed panels that could be added to this strip from "+". */
  addable: PanelDefinition[];
  onAdd: (id: PanelId) => void;
  /** Rows for the group menu, built by the group. */
  menuItems: MenuItem[];
};

export default function PanelTabStrip({
  label,
  tabs,
  active,
  onActivate,
  onClose,
  onMove,
  addable,
  onAdd,
  menuItems,
}: PanelTabStripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  };

  useIsoLayoutEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // A selected tab scrolls into view, so picking one from the menu or the keyboard never leaves it hidden.
  useEffect(() => {
    if (!active) return;
    document.getElementById(tabDomId(active))?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [active, tabs.length]);

  const focusTab = (id: PanelId) => {
    onActivate(id);
    requestAnimationFrame(() => document.getElementById(tabDomId(id))?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent, id: PanelId, closable: boolean) => {
    const at = tabs.findIndex((t) => t.id === id);
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      onMove(id, e.key === "ArrowLeft" ? -1 : 1);
      requestAnimationFrame(() => document.getElementById(tabDomId(id))?.focus());
      return;
    }
    if (e.key === "ArrowRight") focusTab(tabs[(at + 1) % tabs.length].id);
    else if (e.key === "ArrowLeft") focusTab(tabs[(at - 1 + tabs.length) % tabs.length].id);
    else if (e.key === "Home") focusTab(tabs[0].id);
    else if (e.key === "End") focusTab(tabs[tabs.length - 1].id);
    else if ((e.key === "Delete" || e.key === "Backspace") && closable) onClose(id);
    else return;
    e.preventDefault();
  };

  const addItems: MenuItem[] = addable.length
    ? addable.map((d) => ({ key: d.id, label: d.title, onSelect: () => onAdd(d.id) }))
    : [{ key: "none", label: "Every panel is open", disabled: true, onSelect: () => {} }];

  return (
    <div className="flex h-[44px] shrink-0 items-stretch gap-[4px] border-b border-hairline pl-[14px] pr-[4px]">
      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          role="tablist"
          aria-label={label}
          onScroll={measure}
          className="flex h-full min-w-0 items-stretch gap-[18px] overflow-x-auto overflow-y-hidden"
        >
          {tabs.map((t) => {
            const selected = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabDomId(t.id)}
                aria-selected={selected}
                aria-controls={panelBodyDomId(t.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => onActivate(t.id)}
                onKeyDown={(e) => onKeyDown(e, t.id, t.closable !== false)}
                className={`inline-flex h-full shrink-0 items-center whitespace-nowrap text-body ${
                  selected ? "text-fg shadow-[inset_0_-2px_0_var(--ice)]" : "text-fg-dim hover:text-fg"
                }`}
              >
                {t.title}
              </button>
            );
          })}
        </div>
        {fade.start ? <span aria-hidden data-fade="start" className="tab-fade pointer-events-none absolute inset-y-0 left-0 w-[32px]" /> : null}
        {fade.end ? <span aria-hidden data-fade="end" className="tab-fade tab-fade-end pointer-events-none absolute inset-y-0 right-0 w-[32px]" /> : null}
      </div>
      <div className="flex shrink-0 items-center">
        <PopoverMenu label={`Add a panel to ${label.toLowerCase()}`} items={addItems} pressedWhenOpen={false} triggerClassName={STRIP_BUTTON}>
          <IconPlus />
        </PopoverMenu>
        <PopoverMenu label={`${label} menu`} items={menuItems} pressedWhenOpen={false} triggerClassName={STRIP_BUTTON}>
          <IconMore />
        </PopoverMenu>
      </div>
    </div>
  );
}
