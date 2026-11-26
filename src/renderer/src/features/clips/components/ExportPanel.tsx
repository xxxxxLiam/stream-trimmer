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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" id="help-anchor-clips-tabs">
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
          <div className="flex justify-between px-[12px] pb-[4px] pt-[10px] text-meta leading-[normal] text-fg-dim">
            Waiting in this video<span>{c.waiting.length}</span>
          </div>
          {[...c.waiting, ...c.made].map((clip) => {
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
    </div>
  );
}
