/**
 * File: SettingsNewLocation.tsx
 * Path: src/renderer/src/features/settings/components/SettingsNewLocation.tsx
 * Description: The New location form (board 04.6.6, chips A): Name with preset chips (B-roll, Sound effects, Music,
 *   Reference; a tap fills the name, typing still works), Folder with Choose and the branded-folder line, Sound only
 *   (off, on for Sound effects), then Add location.
 */
import { useState } from "react";
import { DrawerHeader, SwitchRow, drawerBodyRoomy, outlineButton } from "../../../shared/components/DrawerRows";
import { isBrandedName, safeFolderName } from "../../../../../common/utils/brandedFolder";

export const LOCATION_PRESETS = ["B-roll", "Sound effects", "Music", "Reference"] as const;

/** Sound effects is sound; the other presets keep their picture. */
export const presetSoundOnly = (name: string): boolean => name.trim().toLowerCase() === "sound effects";

/** The folder a location gets when no folder was chosen: "Clipr B-roll" beside the Clips folder. */
export function locationFolderName(name: string): string {
  const leaf = safeFolderName(name, "Location");
  return isBrandedName(leaf) ? leaf : `Clipr ${leaf}`;
}

export type SettingsNewLocationProps = {
  /** Where it goes until a folder is chosen, shown as the default path ("Downloads/Clipr B-roll"). */
  defaultFolder: (name: string) => string;
  /** Opens the folder dialog; resolves to the folder that will be made, or null when cancelled. */
  onChoose: (name: string) => Promise<string | null>;
  /** Creates it. Returns the problem sentences, or none once added. */
  onAdd: (input: { name: string; clipsDir?: string; soundOnly: boolean }) => string[];
  onBack: () => void;
  onClose: () => void;
};

const fieldInput = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg outline-none focus:border-ice-tint-50";

export default function SettingsNewLocation(p: SettingsNewLocationProps) {
  const [name, setName] = useState("");
  const [sound, setSound] = useState(false);
  const [soundTouched, setSoundTouched] = useState(false);
  const [picked, setPicked] = useState<{ dir: string; forName: string } | null>(null);
  const [problem, setProblem] = useState("");
  const setNameAndSound = (n: string) => {
    setName(n);
    setProblem("");
    if (!soundTouched) setSound(presetSoundOnly(n));
  };
  const shown = picked ? picked.dir : p.defaultFolder(name.trim() || "Location");
  const add = () => {
    const found = p.onAdd({ name, soundOnly: sound, ...(picked ? { clipsDir: picked.dir } : {}) });
    if (found.length) setProblem(found[0]);
  };
  return (
    <>
      <DrawerHeader closeName="Settings" title="New location" back="Settings" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBodyRoomy}>
        <div className="flex flex-col gap-[8px]">
          <label htmlFor="location-new-name" className="text-meta text-fg-dim">Name</label>
          <input
            id="location-new-name"
            type="text"
            maxLength={80}
            autoFocus
            value={name}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => setNameAndSound(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className={`${fieldInput} ${problem ? "border-error" : ""}`}
          />
          <div className="flex flex-wrap gap-[8px]" role="group" aria-label="Presets">
            {LOCATION_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={name.trim().toLowerCase() === n.toLowerCase()}
                onClick={() => setNameAndSound(n)}
                className="h-[32px] rounded-full border border-hairlineStrong bg-raised px-[12px] text-body leading-[normal] text-fg hover:bg-hover aria-pressed:border-ice"
              >
                {n}
              </button>
            ))}
          </div>
          {problem && <span role="alert" className="text-meta text-error">{problem}</span>}
        </div>
        <div className="flex flex-col gap-[4px]">
          <span className="text-meta text-fg-dim">Folder</span>
          <div className="flex items-center gap-[8px]">
            <span className="flex h-target min-w-[0px] flex-1 items-center rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg"><span className="truncate" title={shown}>{shown}</span></span>
            <button
              type="button"
              aria-label="Choose a folder"
              onClick={() => void p.onChoose(name.trim() || "Location").then((dir) => dir && setPicked({ dir, forName: name.trim() }))}
              className={outlineButton}
            >
              Choose
            </button>
          </div>
          <span className="text-meta text-fg-dim">Clips for this location go straight into the folder you choose.</span>
        </div>
        <div className="flex flex-col gap-[2px]">
          <SwitchRow label="Sound only" on={sound} onFlip={() => { setSound(!sound); setSoundTouched(true); }} />
          <span className="text-meta text-fg-dim">Saves the sound as M4A, no picture.</span>
        </div>
        <button type="button" onClick={add} className="h-target rounded-control bg-ice px-[16px] text-body font-medium text-bg">Add location</button>
      </div>
    </>
  );
}
