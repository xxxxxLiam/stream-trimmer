/**
 * File: HistoryPanel.tsx
 * Path: src/renderer/src/features/downloads/components/HistoryPanel.tsx
 * Description: The History panel: every clip already made, grouped by day, with the pill search.
 *   Rows show a thumbnail slot, name, "length · campaign · time" and a ⋯ menu (Show in Finder, In editor, Go to source).
 */
import { useEffect, useState } from "react";
import { Check2 } from "react-bootstrap-icons";
import HandoffRow from "../../clips/components/HandoffRow";
import { useHandoffNotice } from "../../clips/hooks/useHandoffNotice";
import { getClipDestination } from "../../player/hooks/useClipDestination";
import PillSearch from "../../../shared/components/PillSearch";
import ActionRow from "../../../shared/components/ActionRow";
import { IconInEditor, IconJumpToSource, IconRemove, IconShowFile } from "../../../shared/components/rowIcons";
import { clipTitle } from "../../../shared/utils/downloads";
import { exitSelectClips, selectAllClips, toggleClip, useSelectClips } from "../../../shared/utils/selectClipsStore";
import { finalCutState, useInFinalCut } from "../../../shared/utils/inFinalCutStore";
import { useHistoryController } from "../hooks/useHistoryController";
import { cacheNote } from "../utils/cacheText";
import { rowMeta } from "../utils/historyRows";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const SHOW_LABEL = IS_MAC ? "Show in Finder" : "Show in File Explorer";

export default function HistoryPanel() {
  const h = useHistoryController();
  const [confirmClear, setConfirmClear] = useState(false);
  // In editor on a row answers here too, not only on the Export tab (a failure is never silent).
  const handoff = useHandoffNotice(null, true);
  const pick = useSelectClips();
  // Leaving the panel ends Select clips, so no tick waits unseen behind another tab.
  useEffect(() => () => void exitSelectClips(), []);
  const inFinalCut = useInFinalCut();
  const fc = h.finalCut;
  // Select clips: only location clips can go to Final Cut, so only they take a tick.
  const tickable = h.groups.flatMap((g) => g.entries).filter((e) => fc.canAdd(e) && !h.missing[e.id]);
  const chosen = tickable.filter((e) => pick.ids.has(e.id));

  return (
    <div id="clips-panel" className="flex min-h-0 flex-1 flex-col">
      {pick.on ? (
        <div id="ui-select-clips" className="flex h-[45px] flex-none items-center gap-[8px] border-b border-hairline px-[14px] text-body">
          <button
            type="button"
            role="checkbox"
            aria-checked={tickable.length > 0 && chosen.length === tickable.length}
            aria-label="Select all"
            onClick={() => selectAllClips(tickable.map((x) => x.id))}
            className="flex items-center gap-[8px] text-fg"
          >
            <span className={`flex size-[18px] items-center justify-center rounded-chip border text-meta leading-[normal] ${chosen.length > 0 ? "border-ice bg-ice text-bg" : "border-hairlineStrong"}`}>
              {chosen.length === 0 ? "" : chosen.length === tickable.length ? "✓" : "–"}
            </span>
            Select all
          </button>
          <span className="ml-auto text-meta tabular-nums text-fg-dim">{chosen.length} selected</span>
          <button type="button" onClick={exitSelectClips} className="h-[32px] rounded-pill border border-hairlineStrong px-[14px] text-meta text-fg hover:bg-hover">
            Done
          </button>
        </div>
      ) : null}
      <PillSearch placeholder="Search clips, campaigns, videos" pills={h.pills} onPillsChange={h.setPills} count={h.count} />
      {handoff.handoffNotice && (
        <HandoffRow
          notice={handoff.handoffNotice}
          tried={getClipDestination()}
          onShowInFolder={handoff.showInFolder}
          onSendTo={handoff.sendTo}
        />
      )}
      {fc.notice && (
        <p role={fc.notice.ok ? "status" : "alert"} className={`mx-[10px] my-[8px] text-meta ${fc.notice.ok ? "text-fg-dim" : "rounded-control border border-error px-[12px] py-[8px] text-error"}`}>
          {fc.notice.text}
        </p>
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
                  actions={pick.on ? [] : [
                    ...(fc.canAdd(e)
                      ? [{ key: "finalcut", label: "Add to Final Cut", icon: <IconInEditor />, onSelect: () => void fc.add([e]), disabled: !e.path || h.missing[e.id] || fc.busy || finalCutState(inFinalCut, e.id).added }]
                      : []),
                    { key: "show", label: SHOW_LABEL, icon: <IconShowFile />, onSelect: () => h.show(e), disabled: !e.path || h.missing[e.id] },
                    { key: "editor", label: "In editor", icon: <IconInEditor />, onSelect: () => h.inEditor(e), disabled: !e.path || h.missing[e.id] },
                    { key: "source", label: "Go to source", icon: <IconJumpToSource />, onSelect: () => h.jump(e), disabled: !h.canJump(e) },
                    { key: "remove", label: "Hold to remove from history", icon: <IconRemove />, onSelect: () => h.remove(e.id), danger: true, hold: true },
                  ]}
                >
                  <div
                    onClick={pick.on && tickable.includes(e) ? () => toggleClip(e.id) : undefined}
                    id={g === h.groups[0] && e === g.entries[0] ? "ui-saved-clip" : undefined}
                    className="flex items-center gap-[6px] py-[6px] pl-[8px] pr-[2px]"
                  >
                    {pick.on && tickable.includes(e) ? (
                      <span
                        role="checkbox"
                        aria-checked={pick.ids.has(e.id)}
                        aria-label={`Select ${clipTitle(e.label)}`}
                        className={`flex size-[18px] flex-none items-center justify-center rounded-chip border text-meta leading-[normal] ${pick.ids.has(e.id) ? "border-ice bg-ice text-bg" : "border-hairlineStrong"}`}
                      >
                        {pick.ids.has(e.id) ? "✓" : ""}
                      </span>
                    ) : null}
                    <span className="h-[26px] w-[40px] flex-none rounded-chip bg-hover" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-body font-medium leading-[normal] ${h.missing[e.id] ? "text-disabled" : ""}`}>{clipTitle(e.label)}</div>
                      {finalCutState(inFinalCut, e.id).showing ? (
                        <div className="mt-[2px] flex items-center gap-[4px] truncate text-meta leading-[normal] text-ice">
                          <Check2 width={12} height={12} aria-hidden="true" focusable="false" />
                          In Final Cut
                        </div>
                      ) : (
                        <div className="mt-[2px] truncate text-meta leading-[normal] text-fg-dim">
                          {h.missing[e.id] ? "File missing. It was moved or deleted." : rowMeta(e)}
                        </div>
                      )}
                    </div>
                  </div>
                </ActionRow>
              ))}
            </section>
          ))
        )}
        {h.total > 0 && (
          <div className="mx-[6px] my-[8px] flex items-center gap-[8px] px-[8px] text-meta leading-[normal] text-fg-dim">
            <span className="min-w-0 flex-1">{confirmClear ? "Clear all history? Exported files stay on disk." : "Exported files stay on disk."}</span>
            {confirmClear ? (
              <>
                <button type="button" onClick={() => setConfirmClear(false)} className="h-[44px] shrink-0 rounded-control px-[8px] text-fg hover:bg-hover">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    h.clearAll();
                    setConfirmClear(false);
                  }}
                  className="h-[44px] shrink-0 rounded-control border border-error px-[8px] text-error hover:bg-hover"
                >
                  Clear all
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="h-[44px] shrink-0 rounded-control px-[8px] text-fg hover:bg-hover">
                Clear all history
              </button>
            )}
          </div>
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
      {pick.on ? (
        <div className="flex-none bg-panel px-[10px] pb-[10px] pt-[8px]">
          <button
            type="button"
            disabled={chosen.length === 0 || fc.busy}
            onClick={() =>
              void fc.add(chosen).then((ok) => {
                if (ok) exitSelectClips();
              })
            }
            className="flex h-[44px] w-full items-center justify-center gap-[8px] rounded-pill bg-ice text-body font-medium text-bg disabled:bg-hover disabled:text-disabled"
          >
            <IconInEditor />
            Add to Final Cut {chosen.length || ""}
          </button>
        </div>
      ) : null}
    </div>
  );
}
