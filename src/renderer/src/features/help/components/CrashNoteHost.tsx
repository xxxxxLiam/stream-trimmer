/**
 * File: CrashNoteHost.tsx
 * Path: src/renderer/src/features/help/components/CrashNoteHost.tsx
 * Description: Connects the crash note at the top of Export to the report actions (the same ones the crash
 *   screen uses). Renders nothing unless the window came back after a crash.
 */
import { useEffect, useMemo } from "react";
import CrashNote from "../../../shared/components/CrashNote";
import { crashNoteText, setCrashNoteReport, useCrashNoteOpen, useCrashNoteReport, workIsBack } from "../../../shared/utils/crashNoteStore";
import { useCrashReport } from "../hooks/useCrashReport";
import { CRASHED_ERROR } from "../utils/crashDetails";

export default function CrashNoteHost() {
  const open = useCrashNoteOpen();
  const error = useMemo(() => new Error(CRASHED_ERROR), []);
  const c = useCrashReport(error);
  const shared = useCrashNoteReport();
  // What was pressed here is kept for every tab's Export, so the note reads the same wherever it is seen.
  useEffect(() => {
    if (c.state !== "idle") setCrashNoteReport({ state: c.state });
  }, [c.state]);
  useEffect(() => {
    if (c.copied) setCrashNoteReport({ copied: true });
  }, [c.copied]);
  if (!open) return null;
  const back = workIsBack(typeof window === "undefined" ? undefined : window.electronAPI?.settingsSnapshot);
  return <CrashNote text={crashNoteText(back)} state={shared.state} copied={shared.copied} onSend={() => void c.send()} onCopy={() => void c.copy()} />;
}
