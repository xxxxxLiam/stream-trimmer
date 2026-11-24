/**
 * File: useSaveLocationsState.ts
 * Path: src/renderer/src/modules/clipper/hooks/useSaveLocationsState.ts
 * Description: Saved destination folders: the list, the active one and their nicknames.
 */
import { useCallback, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { displayDirName, readSaveDirNames, writeSaveDirNames } from "../../../shared/utils/downloads";

export function useSaveLocationsState() {
  // Saved locations: a small user-managed list with one active destination.
  // Persisted via the settings store so they survive app restarts.
  const [saveDirs, setSaveDirsState] = useState<string[]>(() =>
    readSetting<string[]>("clipper.saveDirs", []),
  );
  const [saveDir, setSaveDirState] = useState<string | null>(() => {
    const active = readSetting<string | null>("clipper.saveDir", null);
    if (active) return active;
    const list = readSetting<string[]>("clipper.saveDirs", []);
    return list[0] ?? null;
  });
  const setSaveDir = useCallback((dir: string | null) => {
    setSaveDirState(dir);
    writeSetting("clipper.saveDir", dir);
    if (!dir) return;
    setSaveDirsState((prev) => {
      if (prev.includes(dir)) return prev;
      const next = [...prev, dir];
      writeSetting("clipper.saveDirs", next);
      return next;
    });
  }, []);
  const removeSaveDir = useCallback(
    (dir: string) => {
      setSaveDirsState((prev) => {
        const next = prev.filter((d) => d !== dir);
        writeSetting("clipper.saveDirs", next);
        setSaveDirState((current) => {
          if (current !== dir) return current;
          const fallback = next[0] ?? null;
          writeSetting("clipper.saveDir", fallback);
          return fallback;
        });
        return next;
      });
    },
    [],
  );
  const pickSaveDir = useCallback(async () => {
    if (!window.electronAPI) return;
    const chosen = await window.electronAPI.pickDirectory();
    if (chosen) setSaveDir(chosen);
  }, [setSaveDir]);

  // Optional nicknames for saved locations (path -> label).
  const [saveDirNames, setSaveDirNames] = useState<Record<string, string>>(() =>
    readSaveDirNames(),
  );
  const renameSaveDir = useCallback((dir: string, name: string) => {
    setSaveDirNames((prev) => {
      const next = { ...prev };
      if (name.trim()) next[dir] = name.trim();
      else delete next[dir];
      writeSaveDirNames(next);
      return next;
    });
  }, []);
  const labelForDir = useCallback(
    (dir: string | null) => (dir ? displayDirName(dir, saveDirNames) : ""),
    [saveDirNames],
  );

  return {
    saveDirs,
    saveDir,
    setSaveDir,
    removeSaveDir,
    pickSaveDir,
    saveDirNames,
    renameSaveDir,
    labelForDir,
  };
}
