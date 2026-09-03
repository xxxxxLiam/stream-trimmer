/**
 * File: DestinationSelector.tsx
 * Path: src/components/DestinationSelector.tsx
 * Description: Electron-only saved-locations list with renameable labels and an active destination.
 */
import { useState } from "react";
import {
  CheckCircleFill,
  Circle,
  Pencil,
  PlusLg,
  X,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";

export default function DestinationSelector() {
  const {
    isElectron,
    saveDir,
    saveDirs,
    setSaveDir,
    removeSaveDir,
    pickSaveDir,
    labelForDir,
    renameSaveDir,
  } = useClipperContext();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!isElectron) {
    return (
      <div className="rounded-row border border-dashed border-hairline px-3 py-2 text-[11px] text-fg-faint">
        Files save to your browser's Downloads folder. Install the desktop app to
        choose custom folders.
      </div>
    );
  }

  const beginEdit = (dir: string) => {
    setEditing(dir);
    setDraft(labelForDir(dir));
  };

  const commit = () => {
    if (editing) renameSaveDir(editing, draft);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-row border border-hairline bg-panel-raised px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-fg-faint">
          Save to
        </span>
        <button
          type="button"
          onClick={pickSaveDir}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted transition-colors hover:text-accent"
          title="Add a folder"
        >
          <PlusLg size={10} />
          Add folder
        </button>
      </div>

      {saveDirs.length === 0 ? (
        <button
          type="button"
          onClick={pickSaveDir}
          className="text-left text-[12px] text-fg-muted transition-colors hover:text-accent"
        >
          Choose a folder…
        </button>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {saveDirs.map((dir) => {
            const active = dir === saveDir;
            const isEditing = editing === dir;
            return (
              <li key={dir} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSaveDir(dir)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-row px-1 py-1 text-left transition-colors hover:bg-white/5"
                  title={dir}
                >
                  {active ? (
                    <CheckCircleFill size={12} className="shrink-0 text-accent" />
                  ) : (
                    <Circle size={12} className="shrink-0 text-fg-faint" />
                  )}
                  <span className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(null);
                          }
                        }}
                        placeholder="Name this location"
                        className="w-full rounded-chip border border-hairline bg-panel px-1.5 py-0.5 text-[12px] text-fg outline-none focus:border-accent"
                      />
                    ) : (
                      <span
                        className={`block truncate text-[12px] ${
                          active ? "text-fg" : "text-fg-muted"
                        }`}
                      >
                        {labelForDir(dir)}
                      </span>
                    )}
                    <span className="block truncate text-[10px] text-fg-faint">
                      {dir}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => beginEdit(dir)}
                  className="shrink-0 rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                  title="Rename this location"
                  aria-label={`Rename ${dir}`}
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => removeSaveDir(dir)}
                  className="shrink-0 rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                  title="Remove this location"
                  aria-label={`Remove ${dir}`}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
