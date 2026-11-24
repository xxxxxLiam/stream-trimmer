/**
 * File: PanelTabStrip.tsx
 * Path: src/renderer/src/modules/layout/components/PanelTabStrip.tsx
 * Description: A group's Premiere-style tab strip: tabs that scroll sideways with no scrollbar
 *   when there are too many, a fade on any side with hidden tabs, the selected tab kept in view,
 *   and "+" and a menu pinned at the right. Keys on a focused tab: arrows move, Home/End jump,
 *   Delete closes, Alt+arrows reorder.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThreeDots, Plus, X } from "react-bootstrap-icons";
import PopoverMenu, { type MenuItem } from "./PopoverMenu";
import type { PanelDefinition, PanelId } from "../utils/panelRegistry";

export const tabDomId = (id: PanelId) => `panel-tab-${id}`;
export const panelBodyDomId = (id: PanelId) => `panel-body-${id}`;

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
    <div className="flex h-11 shrink-0 items-stretch border-b border-hairline">
      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          role="tablist"
          aria-label={label}
          onScroll={measure}
          className="flex h-full min-w-0 items-stretch overflow-x-auto overflow-y-hidden"
        >
          {tabs.map((t) => {
            const selected = t.id === active;
            return (
              <div key={t.id} className="flex shrink-0 items-center" role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={tabDomId(t.id)}
                  aria-selected={selected}
                  aria-controls={panelBodyDomId(t.id)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onActivate(t.id)}
                  onKeyDown={(e) => onKeyDown(e, t.id, t.closable !== false)}
                  className={`flex h-full items-center whitespace-nowrap border-b-2 px-3 text-body ${
                    selected ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
                  }`}
                >
                  {t.title}
                </button>
                {selected && t.closable !== false ? (
                  <button
                    type="button"
                    className="icon-btn -ml-2 mr-1"
                    aria-label={`Close ${t.title}`}
                    title={`Close ${t.title}`}
                    tabIndex={-1}
                    onClick={() => onClose(t.id)}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {fade.start ? <span aria-hidden data-fade="start" className="tab-fade pointer-events-none absolute inset-y-0 left-0 w-6" /> : null}
        {fade.end ? <span aria-hidden data-fade="end" className="tab-fade tab-fade-end pointer-events-none absolute inset-y-0 right-0 w-6" /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 px-1">
        <PopoverMenu label={`Add a panel to ${label.toLowerCase()}`} items={addItems} pressedWhenOpen={false}>
          <Plus size={16} />
        </PopoverMenu>
        <PopoverMenu label={`${label} menu`} items={menuItems} pressedWhenOpen={false}>
          <ThreeDots size={16} />
        </PopoverMenu>
      </div>
    </div>
  );
}
