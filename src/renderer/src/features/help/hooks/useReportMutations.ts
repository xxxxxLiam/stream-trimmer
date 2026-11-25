/**
 * File: useReportMutations.ts
 * Path: src/renderer/src/features/help/hooks/useReportMutations.ts
 * Description: Writes for "Report a problem": send a report through the main process (it adds the versions and
 *   the cleaned log, and keeps the report for a later launch when the relay can't be reached), and copy the details.
 */
import { useCallback, useRef, useState } from "react";
import { makeReport, reportText, sendReport } from "../utils/reports";

export type ReportState = "writing" | "sent" | "kept";

async function readDetails(): Promise<string> {
  try {
    const d = await window.electronAPI?.readDiagnostics?.();
    return d?.text ?? "";
  } catch {
    return "";
  }
}

export function useReportMutations() {
  const [state, setState] = useState<ReportState>("writing");
  const [copied, setCopied] = useState(false);

  // A second click while the first report is on its way must not file a second one.
  const sending = useRef(false);

  const sendOnce = useCallback(async (note: string) => {
    setState(await sendReport("problem", note, "Reported from Help"));
  }, []);

  const send = useCallback(async (note: string) => {
    if (sending.current) return;
    sending.current = true;
    try {
      await sendOnce(note);
    } finally {
      sending.current = false;
    }
  }, [sendOnce]);

  const copyDetails = useCallback(async (note: string) => {
    const report = makeReport(note, await readDetails(), new Date(), "copy");
    try {
      await navigator.clipboard.writeText(reportText(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  const reset = useCallback(() => {
    setState("writing");
    setCopied(false);
  }, []);

  return { state, copied, send, copyDetails, reset };
}
