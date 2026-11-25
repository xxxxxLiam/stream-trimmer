/**
 * File: ExportPanel.tsx
 * Path: src/renderer/src/features/clips/components/ExportPanel.tsx
 * Description: The Export panel (the bank): the clip being made on top, then "Waiting in this video"
 *   with the suggested next on an Ice edge. Logic-free: everything comes from useExportController.
 */
import { useEntryActions } from "../../../shared/hooks/useEntryActions";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { suggestProjectName } from "../utils/projectName";
import { validateClipName } from "../utils/clipName";
import PanelEmptyNote, { KeyChip } from "../../../modules/layout/components/PanelEmptyNote";
import { useExportController } from "../hooks/useExportController";
import FailedRow from "./FailedRow";
import MakingRow from "./MakingRow";
import WaitingRow from "./WaitingRow";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export default function ExportPanel() {
  const c = useExportController();
  const host = usePanelHost();
  const actions = useEntryActions();
  const finishedEntry = c.finishedEntry;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" id="help-anchor-clips-tabs">
      {c.making && <MakingRow kind="making" {...c.making} />}
      {c.failed && (
        <FailedRow
          failed={c.failed}
          failure={c.failure}
          onAction={(a) => {
            if (a === "retry") c.retry();
            else if (a === "changeFolder") void c.changeFolder();
            else if (a === "showInBrowser") c.showInBrowser();
            else c.saveForLater();
          }}
        />
      )}
      {c.finished && (
        <MakingRow
          kind="finished"
          name={c.finished.name}
          secondsLeft={c.finished.secondsLeft}
          canShow={c.canShowFinished}
          onUndo={c.undo}
          onShow={() => finishedEntry && actions.show(finishedEntry)}
          onInEditor={() => finishedEntry && actions.inEditor(finishedEntry)}
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
                onSelect={() => c.select(clip)}
                onMake={() => void c.make(clip)}
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

      {!c.gate && (c.waiting.length > 0 || c.made.length > 0) && (
        <button type="button" onClick={() => host.openImport()} className="mx-[6px] mt-[4px] h-[44px] rounded-control px-[8px] text-left text-meta text-fg-dim hover:text-fg">
          Import moments
        </button>
      )}
    </div>
  );
}
