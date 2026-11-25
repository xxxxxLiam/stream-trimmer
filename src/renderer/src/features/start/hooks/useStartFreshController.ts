/**
 * File: useStartFreshController.ts
 * Path: src/renderer/src/features/start/hooks/useStartFreshController.ts
 * Description: Asks the main process once at launch whether the one-time "start fresh" prompt is due,
 *   and sends the answer. "fresh" reloads the page on success so the renderer re-reads its emptied
 *   settings and lands on the cold start; a failed backup keeps the dialog with the reason.
 */
import { useCallback, useEffect, useState } from "react";

export const START_FRESH_FAILED =
  "Clipr could not make the backup, so nothing was changed. Try again.";

/** Set once the question is answered, so a reload in the same session never asks (or backs up) again. */
export const ANSWERED_KEY = "clipr.startFreshAnswered";
const answeredThisSession = () => {
  try {
    return window.sessionStorage.getItem(ANSWERED_KEY) === "1";
  } catch {
    return false;
  }
};

export function useStartFreshController() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    if (answeredThisSession()) return;
    window.electronAPI?.startFreshPending?.().then(
      (due) => live && setOpen(!!due),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const answer = useCallback(async (choice: "fresh" | "keep") => {
    const api = window.electronAPI?.startFreshAnswer;
    if (!api) return setOpen(false);
    setBusy(true);
    setError("");
    try {
      const r = await api(choice);
      if (!r.ok) {
        setError(r.error || START_FRESH_FAILED);
        setBusy(false);
        return;
      }
      try {
        window.sessionStorage.setItem(ANSWERED_KEY, "1");
      } catch {
        // No storage: the main process's own answer still stops it on the next launch.
      }
      if (choice === "fresh") {
        window.location.reload();
        return;
      }
      setOpen(false);
    } catch {
      setError(START_FRESH_FAILED);
    }
    setBusy(false);
  }, []);

  return {
    open,
    busy,
    error,
    onStartFresh: () => void answer("fresh"),
    onKeep: () => void answer("keep"),
  };
}
