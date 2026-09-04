/**
 * File: WorkspaceTabs.tsx
 * Path: src/components/WorkspaceTabs.tsx
 * Description: Browser-style workspace tab strip with add, close, rename and busy indicator.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "react-bootstrap-icons";
import { useWorkspace } from "../context/WorkspaceContext";

export default function WorkspaceTabs() {
  const {
    tabs,
    activeId,
    meta,
    labelFor,
    selectTab,
    addTab,
    closeTab,
    renameTab,
  } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commit = () => {
    if (editingId) renameTab(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const busy = meta[tab.id]?.busy;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectTab(tab.id);
            }}
            onDoubleClick={() => {
              setDraft(labelFor(tab.id));
              setEditingId(tab.id);
            }}
            className={`group flex h-7 min-w-0 max-w-[190px] shrink-0 cursor-default items-center gap-1.5 rounded-row border px-2 text-[12px] transition-colors ${
              active
                ? "border-hairline bg-panel-raised text-fg"
                : "border-transparent text-fg-muted hover:bg-panel-hover hover:text-fg"
            }`}
            title={labelFor(tab.id)}
          >
            {busy && (
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            )}
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditingId(null);
                  e.stopPropagation();
                }}
                className="w-28 min-w-0 bg-transparent text-[12px] text-fg outline-none"
              />
            ) : (
              <span className="truncate">{labelFor(tab.id)}</span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-auto shrink-0 rounded-chip p-0.5 text-fg-faint opacity-0 transition-opacity hover:bg-panel-hover hover:text-fg group-hover:opacity-100"
              aria-label={`Close ${labelFor(tab.id)}`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addTab}
        className="shrink-0 rounded-chip p-1.5 text-fg-faint hover:bg-panel-hover hover:text-fg"
        aria-label="New tab"
        title="New tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
