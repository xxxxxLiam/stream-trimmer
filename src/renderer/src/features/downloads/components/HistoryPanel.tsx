/**
 * File: HistoryPanel.tsx
 * Path: src/renderer/src/features/downloads/components/HistoryPanel.tsx
 * Description: The History panel: every clip already made, grouped by day, with the pill search.
 *   Rows show a thumbnail slot, name, "length · campaign · time" and a ⋯ menu (Show in Finder, In editor, Go to source).
 */
import HandoffRow from "../../clips/components/HandoffRow";
import { useHandoffNotice } from "../../clips/hooks/useHandoffNotice";
import { getClipDestination } from "../../player/hooks/useClipDestination";
import PillSearch from "../../../shared/components/PillSearch";
import ActionRow from "../../../shared/components/ActionRow";
import { IconInEditor, IconJumpToSource, IconShowFile } from "../../../shared/components/rowIcons";
import { clipTitle } from "../../../shared/utils/downloads";
import { useHistoryController } from "../hooks/useHistoryController";
import { cacheNote } from "../utils/cacheText";
import { rowMeta } from "../utils/historyRows";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const SHOW_LABEL = IS_MAC ? "Show in Finder" : "Show in File Explorer";

export default function HistoryPanel() {
  const h = useHistoryController();
  // In editor on a row answers here too, not only on the Export tab (a failure is never silent).
  const handoff = useHandoffNotice(null, true);

  return (
    <div id="clips-panel" className="flex min-h-0 flex-1 flex-col">
      <PillSearch placeholder="Search clips, campaigns, videos" pills={h.pills} onPillsChange={h.setPills} count={h.count} />
      {handoff.handoffNotice && (
        <HandoffRow
          notice={handoff.handoffNotice}
          tried={getClipDestination()}
          onShowInFolder={handoff.showInFolder}
          onSendTo={handoff.sendTo}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {h.total === 0 ? (
          <p className="px-[14px] py-[24px] text-center text-body text-fg-dim">
            No clips yet. Every clip you export lands here, newest first.
          </p>
        ) : h.groups.length === 0 ? (
          <p className="px-[14px] py-[24px] text-center text-body text-fg-dim">No clips match those filters.</p>
        ) : (
          h.groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="flex justify-between px-[12px] pb-[4px] pt-[8px] text-meta leading-[normal] text-fg-dim">
                {g.label}
                <span>{g.entries.length}</span>
              </div>
              {g.entries.map((e) => (
                <ActionRow
                  key={e.id}
                  id={`history:${e.id}`}
                  name={clipTitle(e.label)}
                  className="mx-[6px] my-[3px]"
                  actions={[
                    { key: "show", label: SHOW_LABEL, icon: <IconShowFile />, onSelect: () => h.show(e), disabled: !e.path || h.missing[e.id] },
                    { key: "editor", label: "In editor", icon: <IconInEditor />, onSelect: () => h.inEditor(e), disabled: !e.path || h.missing[e.id] },
                    { key: "source", label: "Go to source", icon: <IconJumpToSource />, onSelect: () => h.jump(e), disabled: !h.canJump(e) },
                  ]}
                >
                  <div
                    id={g === h.groups[0] && e === g.entries[0] ? "ui-saved-clip" : undefined}
                    className="flex items-center gap-[6px] py-[6px] pl-[8px] pr-[2px]"
                  >
                    <span className="h-[26px] w-[40px] flex-none rounded-chip bg-hover" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-body font-medium leading-[normal] ${h.missing[e.id] ? "text-disabled" : ""}`}>{clipTitle(e.label)}</div>
                      <div className="mt-[2px] truncate text-meta leading-[normal] text-fg-dim">
                        {h.missing[e.id] ? "File missing. It was moved or deleted." : rowMeta(e)}
                      </div>
                    </div>
                  </div>
                </ActionRow>
              ))}
            </section>
          ))
        )}
        {h.cache.bytes > 0 && (
          <div className="mx-[6px] my-[8px] flex items-center gap-[8px] px-[8px] text-meta leading-[normal] text-fg-dim">
            <span className="min-w-0">{cacheNote(h.cache.bytes)}</span>
            <button
              type="button"
              disabled={h.cache.clearing}
              onClick={() => void h.cache.clear()}
              className="h-[44px] shrink-0 rounded-control px-[8px] text-fg hover:bg-hover disabled:text-disabled"
            >
              {h.cache.clearing ? "Clearing…" : "Clear unfinished"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
