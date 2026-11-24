/**
 * File: ExportPanel.tsx
 * Path: src/renderer/src/features/clips/components/ExportPanel.tsx
 * Description: The Export panel (the bank): the clip being made on top, then "Waiting in this video"
 *   with the suggested next on an Ice edge. Logic-free: everything comes from useExportController.
 */
import { useEntryActions } from "../../../shared/hooks/useEntryActions";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { suggestProjectName } from "../utils/projectName";
import { validateClipName } from "../utils/clipName";
import { emptyExportText } from "../utils/exportRows";
import { useExportController } from "../hooks/useExportController";
import ImportTimestamps from "./ImportTimestamps";
import MakingRow from "./MakingRow";
import WaitingRow from "./WaitingRow";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export default function ExportPanel() {
  const c = useExportController();
  const { duration } = useClipperContext();
  const actions = useEntryActions();
  const finishedEntry = c.finishedEntry;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" id="help-anchor-clips-tabs">
      {c.making && <MakingRow kind="making" {...c.making} />}
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
        <p className="px-[14px] py-6 text-center text-body text-fg-dim">{c.gate}</p>
      ) : c.waiting.length === 0 ? (
        <p className="px-[14px] py-6 text-center text-body text-fg-dim">{emptyExportText(IS_MAC)}</p>
      ) : (
        <>
          <div className="flex justify-between px-3 pb-1 pt-[10px] text-meta text-fg-dim">
            Waiting in this video<span>{c.waiting.length}</span>
          </div>
          {c.waiting.map((clip) => {
            const name = validateClipName(clip.label).ok ? clip.label.trim() : suggestProjectName(clip);
            return (
              <WaitingRow
                key={clip.id}
                clip={clip}
                name={name || clip.id}
                suggested={clip.id === c.nextId}
                selected={clip.id === c.selectedId}
                onSelect={() => c.select(clip)}
                onMake={() => void c.make(clip)}
                onRemove={() => c.remove(clip)}
              />
            );
          })}
        </>
      )}

      {c.notice && (
        <p role="alert" className="mx-[10px] my-2 rounded-control border border-error px-3 py-2 text-meta text-error">
          {c.notice}
        </p>
      )}

      {!c.gate && (
        <button type="button" onClick={() => c.setImporting(true)} className="mx-[6px] mt-1 h-target rounded-control text-left text-meta text-fg-dim hover:text-fg px-2">
          Import timestamps
        </button>
      )}
      {c.importing && (
        <ImportTimestamps
          duration={duration || undefined}
          existing={c.clips.map((x) => ({ id: x.id, name: x.label }))}
          onImport={c.importClips}
          onCancel={() => c.setImporting(false)}
        />
      )}
    </div>
  );
}
