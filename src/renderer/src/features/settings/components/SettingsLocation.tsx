/**
 * File: SettingsLocation.tsx
 * Path: src/renderer/src/features/settings/components/SettingsLocation.tsx
 * Description: One location (board 04.6.7): Name, Folder with Change, Sound only, Delete location, and nothing else
 *   (no quota, clip length, languages or Export settings). A folder change applies to new clips only.
 */
import { useState } from "react";
import { DrawerHeader, SwitchRow, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";

export type SettingsLocationProps = {
  name: string;
  folderLabel: string;
  soundOnly: boolean;
  onSoundOnly: (on: boolean) => void;
  /** Choose a different folder. Returns a sentence when it was refused, else null. */
  onChangeFolder: () => Promise<string | null>;
  /** Rename. Returns the problem sentences (empty, too long, taken) or none once saved. */
  onRename: (name: string) => string[];
  confirmingDelete: boolean;
  onDelete: () => void;
  onBack: () => void;
  onClose: () => void;
};

const fieldInput = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg outline-none focus:border-ice-tint-50";

export default function SettingsLocation(p: SettingsLocationProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [nameProblem, setNameProblem] = useState("");
  const [folderProblem, setFolderProblem] = useState("");
  const commitName = () => {
    if (draft === null) return;
    if (draft.trim() === p.name) {
      setDraft(null);
      setNameProblem("");
      return;
    }
    const found = p.onRename(draft);
    setNameProblem(found[0] ?? "");
    if (!found.length) setDraft(null);
  };
  return (
    <>
      <DrawerHeader closeName="Settings" title={p.name} back="Settings" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
        <div className="flex flex-col gap-[8px] border-b border-hairline py-[12px]">
          <label htmlFor="location-name" className="text-body leading-[normal]">Name</label>
          <input
            id="location-name"
            type="text"
            maxLength={80}
            value={draft ?? p.name}
            aria-invalid={nameProblem ? true : undefined}
            onChange={(e) => { setDraft(e.target.value); setNameProblem(""); }}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape" && draft !== null) { e.stopPropagation(); setDraft(null); setNameProblem(""); }
            }}
            className={`${fieldInput} ${nameProblem ? "border-error" : ""}`}
          />
          {nameProblem && <span role="alert" className="text-meta text-error">{nameProblem}</span>}
        </div>
        <div className="flex flex-col gap-[4px] border-b border-hairline py-[12px]">
          <div className="flex items-center gap-[8px]">
            <div className="flex min-w-[0px] flex-1 items-center justify-between gap-[8px]">
              <span className="text-body leading-[normal]">Folder</span>
              <span className="truncate text-meta text-fg-dim">{p.folderLabel}</span>
            </div>
            <button type="button" aria-label={`Change the ${p.name} folder`} onClick={() => void p.onChangeFolder().then((e) => setFolderProblem(e ?? ""))} className={outlineButton}>
              Change
            </button>
          </div>
          {folderProblem ? (
            <span role="alert" className="text-meta text-error">{folderProblem}</span>
          ) : (
            <span className="text-meta text-fg-dim">New clips go here. Clips already made stay where they are.</span>
          )}
        </div>
        <div className="flex flex-col gap-[2px] py-[4px]">
          <SwitchRow label="Sound only" on={p.soundOnly} onFlip={() => p.onSoundOnly(!p.soundOnly)} />
          <span className="text-meta text-fg-dim">Saves the sound as M4A, no picture.</span>
        </div>
        <button type="button" aria-label={p.confirmingDelete ? `Click again to delete ${p.name}` : `Delete location ${p.name}`} onClick={p.onDelete} className="mt-[8px] h-target self-start bg-transparent text-meta text-fg-dim underline underline-offset-[3px]">
          {p.confirmingDelete ? `Click again to delete ${p.name}` : "Delete location"}
        </button>
      </div>
    </>
  );
}
