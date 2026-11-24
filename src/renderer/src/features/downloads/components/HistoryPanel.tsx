/**
 * File: HistoryPanel.tsx
 * Path: src/renderer/src/features/downloads/components/HistoryPanel.tsx
 * Description: The History panel: every clip already made, grouped by day, with the pill search.
 *   Rows show a thumbnail slot, name, "length · campaign · time" and three icon buttons.
 */
import PillSearch from "../../../shared/components/PillSearch";
import RowIconButton from "../../../shared/components/RowIconButton";
import { IconInEditor, IconJumpToSource, IconShowFile } from "../../../shared/components/rowIcons";
import { clipTitle } from "../../../shared/utils/downloads";
import { useHistoryController } from "../hooks/useHistoryController";
import { cacheNote } from "../utils/cacheText";
import { rowMeta } from "../utils/historyRows";

export default function HistoryPanel() {
  const h = useHistoryController();

  return (
    <div id="clips-panel" className="flex min-h-0 flex-1 flex-col">
      <PillSearch placeholder="Search clips, campaigns, videos" pills={h.pills} onPillsChange={h.setPills} count={h.count} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {h.total === 0 ? (
          <p className="px-[14px] py-6 text-center text-body text-fg-dim">
            No clips yet. Every clip you export lands here, newest first.
          </p>
        ) : h.groups.length === 0 ? (
          <p className="px-[14px] py-6 text-center text-body text-fg-dim">No clips match those filters.</p>
        ) : (
          h.groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="flex justify-between px-3 pb-1 pt-2 text-meta text-fg-dim">
                {g.label}
                <span>{g.entries.length}</span>
              </div>
              {g.entries.map((e) => (
                <div
                  key={e.id}
                  id={g === h.groups[0] && e === g.entries[0] ? "ui-saved-clip" : undefined}
                  className={`mx-[6px] my-[3px] flex items-center gap-[6px] rounded-control bg-raised py-[6px] pl-2 pr-[6px] ${h.missing[e.id] ? "opacity-60" : ""}`}
                >
                  <span className="h-[26px] w-[40px] flex-none rounded-chip bg-hover" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium">{clipTitle(e.label)}</div>
                    <div className="mt-[2px] truncate text-meta text-fg-dim">
                      {h.missing[e.id] ? "File missing. It was moved or deleted." : rowMeta(e)}
                    </div>
                  </div>
                  <span className="flex flex-none gap-[2px]">
                    <RowIconButton label="Jump to source" onClick={() => h.jump(e)} disabled={!h.canJump(e)}>
                      <IconJumpToSource />
                    </RowIconButton>
                    <RowIconButton label="Show in Finder" onClick={() => h.show(e)} disabled={!e.path || h.missing[e.id]}>
                      <IconShowFile />
                    </RowIconButton>
                    <RowIconButton label="In editor" onClick={() => h.inEditor(e)} disabled={!e.path || h.missing[e.id]}>
                      <IconInEditor />
                    </RowIconButton>
                  </span>
                </div>
              ))}
            </section>
          ))
        )}
        {h.cache.bytes > 0 && (
          <div className="mx-[6px] my-2 flex items-center gap-2 px-2 text-meta text-fg-dim">
            <span className="min-w-0">{cacheNote(h.cache.bytes)}</span>
            <button
              type="button"
              disabled={h.cache.clearing}
              onClick={() => void h.cache.clear()}
              className="h-target shrink-0 rounded-control px-2 text-fg hover:bg-hover disabled:text-disabled"
            >
              {h.cache.clearing ? "Clearing…" : "Clear unfinished"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
