/**
 * File: ExportPanel.tsx
 * Path: src/renderer/src/features/clips/components/ExportPanel.tsx
 * Description: The Export panel (the bank): the clip being made on top, then "Waiting in this video"
 *   with the suggested next on an Ice edge. Logic-free: everything comes from useExportController.
 */
import { clipLength, type BankedClip } from "../../../shared/utils/bank";
import { lengthVerdict, type LengthRule } from "../../../shared/utils/lengthRule";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { useMomentNote } from "../../../shared/utils/momentNoteStore";
import { useEntryActions } from "../../../shared/hooks/useEntryActions";
import { suggestProjectName } from "../utils/projectName";
import { validateClipName } from "../utils/clipName";
import PanelEmptyNote, { KeyChip } from "../../../modules/layout/components/PanelEmptyNote";
import { useExportController } from "../hooks/useExportController";
import { getClipDestination } from "../../player/hooks/useClipDestination";
import FailedRow from "./FailedRow";
import HandoffRow from "./HandoffRow";
import MakingRow from "./MakingRow";
import OfflineRow from "./OfflineRow";
import CrashNoteHost from "../../help/components/CrashNoteHost";
import WaitingRow from "./WaitingRow";
import PillSearch from "../../../shared/components/PillSearch";
import SortFilterPanel from "./SortFilterPanel";
import { DEFAULT_VIEW, SORT_LABELS, applyView, type BankView } from "../utils/bankView";
import { useState } from "react";
import { IconRemove } from "../../../shared/components/rowIcons";
import { exitSelectMoments, selectAllMoments, toggleMoment, useSelectMoments } from "../../../shared/utils/selectMomentsStore";

/** A moment shorter than the campaign's minimum says so in one dim line; the rule is the editor's to bend. */
function underMinimum(clip: BankedClip, rule: LengthRule | null, campaign: string): string | undefined {
  const v = lengthVerdict(clipLength(clip), rule, campaign);
  return v.state === "out" && /under/.test(v.label) ? v.label : undefined;
}

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export default function ExportPanel() {
  const c = useExportController();
  const actions = useEntryActions();
  // Every workspace tab renders its own Export; only the one in view says it.
  const active = useIsTabActive();
  const momentNote = useMomentNote();
  const pick = useSelectMoments();
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<BankView>(DEFAULT_VIEW);
  const all = [...c.waiting, ...c.made];
  const everyClip = applyView(all, view);
  const topics = [...new Set(all.map((x) => x.category).filter((t): t is string => !!t))];
  const filterPills = [...view.topics, ...view.tiers.map((t) => `T${t}`), ...(view.minRating > 0 ? [`${view.minRating}+`] : [])];
  const tickable = everyClip.filter((x) => x.status === "banked");
  const chosen = tickable.filter((x) => pick.ids.has(x.id));
  const leave = () => {
    setConfirming(false);
    exitSelectMoments();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto" id="help-anchor-clips-tabs">
      {pick.on ? (
        <div id="ui-select-moments" className="flex h-[45px] flex-none items-center gap-[8px] border-b border-hairline px-[14px] text-body">
          <button
            type="button"
            role="checkbox"
            aria-checked={tickable.length > 0 && chosen.length === tickable.length}
            aria-label="Select all"
            onClick={() => selectAllMoments(tickable.map((x) => x.id))}
            className="flex items-center gap-[8px] text-fg"
          >
            <span className={`flex size-[18px] items-center justify-center rounded-chip border text-meta leading-[normal] ${chosen.length > 0 ? "border-ice bg-ice text-bg" : "border-hairlineStrong"}`}>
              {chosen.length === 0 ? "" : chosen.length === tickable.length ? "✓" : "–"}
            </span>
            Select all
          </button>
          <span className="ml-auto text-meta tabular-nums text-fg-dim">{chosen.length} selected</span>
          <button type="button" onClick={leave} className="h-[32px] rounded-pill border border-hairlineStrong px-[14px] text-meta text-fg hover:bg-hover">
            Done
          </button>
        </div>
      ) : null}
      <CrashNoteHost />
      {active && momentNote && (
        <p role="status" className="mx-[10px] mt-[10px] text-meta text-fg-dim">
          {momentNote}
        </p>
      )}
      {c.making && <MakingRow kind="making" {...c.making} onCancel={c.cancel} />}
      {c.offline && <OfflineRow name={c.offline.name} percent={c.offline.percent} />}
      {c.failed && (
        <FailedRow
          failed={c.failed}
          failure={c.failure}
          campaignName={c.campaignName}
          signedIn={c.signedIn}
          onAction={(a) => {
            if (a === "retry") c.retry();
            else if (a === "changeFolder") void c.changeFolder();
            else if (a === "showFolder") c.showFolder();
            else if (a === "showInBrowser") c.showInBrowser();
            else if (a === "signIn") c.signIn();
            else c.saveForLater();
          }}
        />
      )}
      {c.finished.map((f) => (
        <MakingRow
          key={f.entryId}
          kind="finished"
          name={f.name}
          secondsLeft={f.secondsLeft}
          canShow={f.canShow}
          onUndo={() => void c.undo(f.entryId)}
          onShow={() => f.entry && actions.show(f.entry)}
          onInEditor={() => f.entry && actions.inEditor(f.entry)}
        />
      ))}

      {c.handoffNotice && (
        <HandoffRow
          notice={c.handoffNotice}
          tried={getClipDestination()}
          onShowInFolder={c.showInFolder}
          onSendTo={c.sendTo}
        />
      )}

      {c.gate ? (
        <p className="px-[14px] py-[24px] text-center text-body text-fg-dim">{c.gate}</p>
      ) : c.waiting.length === 0 && c.made.length === 0 ? (
        <PanelEmptyNote>
          Nothing waiting. Mark a part and press <KeyChip>{IS_MAC ? "⌘B" : "Ctrl B"}</KeyChip> to save it for later, or paste moments from
          your sheet.
        </PanelEmptyNote>
      ) : (
        <>
          {pick.on ? null : (
          <PillSearch
            placeholder="Search moments"
            pills={[...filterPills, ...view.words]}
            onPillsChange={(next) =>
              setView({
                ...view,
                words: next.filter((p) => !filterPills.includes(p)),
                topics: view.topics.filter((t) => next.includes(t)),
                tiers: view.tiers.filter((t) => next.includes(`T${t}`)),
                minRating: next.includes(`${view.minRating}+`) ? view.minRating : 0,
              })
            }
            count={everyClip.length === all.length ? `${all.length} ${all.length === 1 ? "moment" : "moments"}` : `${everyClip.length} of ${all.length}`}
            inline
            trailing={<SortFilterPanel view={view} onChange={setView} topics={topics} />}
          />
          )}
          <div className="flex items-center gap-[8px] px-[12px] pb-[6px] pt-[6px] text-meta leading-[normal] text-fg-dim">
            Waiting in this video
            <span className="ml-auto inline-flex items-center gap-[4px]">
              <span aria-hidden="true">⇅</span>
              {SORT_LABELS[view.sort]}
            </span>
            <span>{c.waiting.length}</span>
          </div>
          {everyClip.map((clip) => {
            const name = validateClipName(clip.label).ok ? clip.label.trim() : suggestProjectName(clip);
            return (
              <WaitingRow
                key={clip.id}
                clip={clip}
                name={name || clip.id}
                suggested={clip.id === c.nextId}
                selected={clip.id === c.selectedId}
                made={clip.status !== "banked"}
                lengthNote={underMinimum(clip, c.lengthRule, c.campaignName)}
                onSelect={() => c.select(clip)}
                onMake={() => void c.make(clip)}
                onRename={(label) => c.rename(clip, label)}
                onCopy={() => c.copyClip(clip)}
                onRemove={() => c.remove(clip)}
                picking={pick.on && clip.status === "banked" ? { checked: pick.ids.has(clip.id), onToggle: () => toggleMoment(clip.id) } : undefined}
              />
            );
          })}
        </>
      )}

      {c.notice && (
        <p role="alert" className="mx-[10px] my-[8px] rounded-control border border-error px-[12px] py-[8px] text-meta text-error">
          {c.notice}
        </p>
      )}
      {pick.on ? (
        <div className="sticky bottom-0 mt-auto flex-none bg-panel px-[10px] pb-[10px] pt-[8px]">
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => setConfirming(true)}
            className="flex h-[44px] w-full items-center justify-center gap-[8px] rounded-pill border border-error text-body font-medium text-error disabled:opacity-60"
          >
            <IconRemove />
            Delete {chosen.length || ""}
          </button>
        </div>
      ) : null}
      {pick.on && confirming ? <div aria-hidden="true" className="absolute inset-0 z-10 bg-bg-overlay-60" /> : null}
      {pick.on && confirming ? (
        <div role="alertdialog" aria-label={`Delete ${chosen.length} moments`} className="absolute inset-x-[10px] top-[60px] z-20 rounded-panel border border-hairlineStrong bg-raised p-[16px]">
          <h3 className="m-0 text-[17px] font-medium text-fg">Delete {chosen.length} {chosen.length === 1 ? "moment" : "moments"}?</h3>
          <p className="my-[8px] text-meta leading-[1.5] text-fg-dim">They leave the bank. Clips you already made are not touched. This cannot be undone.</p>
          <div className="flex gap-[8px]">
            <button type="button" onClick={() => setConfirming(false)} className="h-[44px] flex-1 rounded-pill border border-hairlineStrong text-body text-fg hover:bg-hover">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                chosen.forEach((x) => c.remove(x));
                leave();
              }}
              className="h-[44px] flex-1 rounded-[22px] border border-error bg-raised text-meta font-semibold text-error"
            >
              Delete {chosen.length}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
