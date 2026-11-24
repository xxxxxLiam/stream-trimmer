/**
 * File: useSavedFiles.ts
 * Path: src/hooks/clipper/useSavedFiles.ts
 * Description: The last saved file, the save confirmation notice and the download history list.
 */
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  clearDownloads as clearDownloadHistory,
  getDownloads,
  removeDownload as removeDownloadEntry,
  subscribeDownloads,
  type DownloadEntry,
} from "../../lib/downloads";

export function useSavedFiles(isElectron: boolean) {
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  // Confirmation notice for a completed save (clip or comments CSV).
  const [savedNotice, setSavedNotice] = useState<{
    kind: "clip" | "comments";
    path: string;
    label: string;
    /** Informational line, e.g. the resolution actually delivered. */
    detail?: string;
  } | null>(null);
  const dismissSavedNotice = useCallback(() => setSavedNotice(null), []);

  // --- Download history ---------------------------------------------------
  const downloads = useSyncExternalStore(subscribeDownloads, getDownloads);
  const revealDownload = useCallback(
    (entry: DownloadEntry) => {
      if (isElectron && window.electronAPI?.showInFolder && entry.path) {
        void window.electronAPI.showInFolder(entry.path);
      }
    },
    [isElectron],
  );
  const removeDownload = useCallback(
    (id: string) => removeDownloadEntry(id),
    [],
  );
  const clearDownloads = useCallback(() => clearDownloadHistory(), []);

  const revealLastSaved = useCallback(() => {
    if (isElectron && window.electronAPI?.showInFolder && lastSavedPath) {
      void window.electronAPI.showInFolder(lastSavedPath);
    }
  }, [isElectron, lastSavedPath]);

  const revealSaved = useCallback(() => {
    if (isElectron && window.electronAPI?.showInFolder && savedNotice?.path) {
      void window.electronAPI.showInFolder(savedNotice.path);
    }
    setSavedNotice(null);
  }, [isElectron, savedNotice]);

  return {
    lastSavedPath,
    setLastSavedPath,
    savedNotice,
    setSavedNotice,
    dismissSavedNotice,
    downloads,
    revealDownload,
    removeDownload,
    clearDownloads,
    revealLastSaved,
    revealSaved,
  };
}

export type SavedFiles = ReturnType<typeof useSavedFiles>;
