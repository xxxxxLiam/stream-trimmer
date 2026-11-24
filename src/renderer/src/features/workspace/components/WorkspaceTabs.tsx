/**
 * File: WorkspaceTabs.tsx
 * Path: src/renderer/src/features/workspace/components/WorkspaceTabs.tsx
 * Description: Browser-style workspace tab strip. A real tablist: arrow keys / Home / End move
 *   and select, Delete closes, F2 renames, Ctrl/Cmd+Shift+Arrow reorders (the keyboard twin of
 *   dragging). Middle-click closes. The close button is always laid out, so closing never
 *   shifts the strip. Overflow scrolls with no visible bar; the active tab is scrolled into view.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "react-bootstrap-icons";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { dropIndex, stepIndex } from "../../../shared/utils/tabOps";

export const tabDomId = (id: string) => `ws-tab-${id}`;
/** The id a tab's panel should carry (role="tabpanel", aria-labelledby={tabDomId(id)}). */
export const tabPanelDomId = (id: string) => `ws-panel-${id}`;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

type DropMark = { id: string; side: "before" | "after" } | null;

export default function WorkspaceTabs() {
  const {
    tabs,
    activeId,
    meta,
    labelFor,
    selectTab,
    addTab,
    closeTab,
    moveTab,
    renameTab,
  } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropMark>(null);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  // Keep the active tab on screen however many tabs there are, and keep focus on it after a
  // close that started from the strip.
  useLayoutEffect(() => {
    const el = document.getElementById(tabDomId(activeId));
    if (refocus.current) {
      refocus.current = false;
      el?.focus();
    }
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  const commit = () => {
    if (editingId) renameTab(editingId, draft);
    setEditingId(null);
  };

  const startRename = (id: string) => {
    setDraft(labelFor(id));
    setEditingId(id);
  };

  const close = (id: string) => {
    const inStrip = !!listRef.current?.contains(document.activeElement);
    if (closeTab(id) && inStrip) refocus.current = true;
  };

  const focusTab = (id: string) => {
    selectTab(id);
    document.getElementById(tabDomId(id))?.focus();
  };

  const onTabKey = (e: KeyboardEvent, id: string, index: number) => {
    if (e.altKey) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const to = index + (e.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= tabs.length) return;
      moveTab(id, to);
      setAnnounce(`${labelFor(id)}, position ${to + 1} of ${tabs.length}`);
      return;
    }
    if (mod) return;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
        e.preventDefault();
        focusTab(tabs[stepIndex(index, e.key === "ArrowLeft" ? -1 : 1, tabs.length)].id);
        break;
      case "Home":
        e.preventDefault();
        focusTab(tabs[0].id);
        break;
      case "End":
        e.preventDefault();
        focusTab(tabs[tabs.length - 1].id);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectTab(id);
        break;
      case "Delete":
        e.preventDefault();
        refocus.current = false;
        if (closeTab(id)) refocus.current = true;
        break;
      case "F2":
        e.preventDefault();
        startRename(id);
        break;
    }
  };

  const modKey = isMac() ? "⌘" : "Ctrl+";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Workspace tabs"
        aria-orientation="horizontal"
        className="flex min-w-0 items-center gap-1 overflow-x-auto"
        onWheel={(e) => {
          // A vertical wheel scrolls the strip sideways, as in a browser.
          if (e.deltaY && !e.deltaX && listRef.current) listRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const busy = meta[tab.id]?.busy;
          const label = labelFor(tab.id);
          const mark = drop?.id === tab.id && dragId !== tab.id ? drop.side : null;
          return (
            <div
              key={tab.id}
              role="presentation"
              draggable={editingId !== tab.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", tab.id);
                setDragId(tab.id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                const side = e.clientX < r.left + r.width / 2 ? "before" : "after";
                setDrop((d) => (d?.id === tab.id && d.side === side ? d : { id: tab.id, side }));
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && drop) {
                  const from = tabs.findIndex((t) => t.id === dragId);
                  const over = tabs.findIndex((t) => t.id === drop.id);
                  if (from >= 0 && over >= 0) moveTab(dragId, dropIndex(from, over, drop.side));
                }
                setDragId(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDrop(null);
              }}
              className={`group relative flex h-7 min-w-[88px] max-w-[190px] flex-[1_1_150px] ${
                dragId === tab.id ? "opacity-50" : ""
              }`}
            >
              {mark && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 z-10 w-0.5 rounded-full bg-accent ${
                    mark === "before" ? "-left-[3px]" : "-right-[3px]"
                  }`}
                />
              )}
              <div
                id={tabDomId(tab.id)}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault(); // no autoscroll cursor on middle-click
                  else if (e.button === 0) selectTab(tab.id);
                }}
                onAuxClick={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  close(tab.id);
                }}
                onKeyDown={(e) => onTabKey(e, tab.id, index)}
                onDoubleClick={() => startRename(tab.id)}
                className={`flex min-w-0 flex-1 cursor-default items-center gap-1.5 rounded-control border pl-2 pr-6 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "border-hairline bg-panel-raised text-fg"
                    : "border-transparent text-fg-dim hover:bg-panel-hover hover:text-fg"
                }`}
                title={`${label} — F2 renames`}
              >
                {busy && (
                  <span
                    className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent"
                    role="img"
                    aria-label="Working"
                  />
                )}
                {editingId === tab.id ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    aria-label="Tab name"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        document.getElementById(tabDomId(tab.id))?.focus();
                      }
                      e.stopPropagation();
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none"
                  />
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </div>
              {/* Always laid out (only its opacity changes), so hover never moves the strip. */}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => close(tab.id)}
                onMouseDown={(e) => e.stopPropagation()}
                className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-chip p-0.5 text-fg-dim transition-opacity hover:bg-panel-hover hover:text-fg focus-visible:opacity-100 ${
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                aria-label={`Close ${label}`}
                title={`Close tab (${modKey}W)`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addTab}
        className="shrink-0 rounded-chip p-1.5 text-fg-dim hover:bg-panel-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="New tab"
        title={`New tab (${modKey}T)`}
      >
        <Plus size={14} />
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
