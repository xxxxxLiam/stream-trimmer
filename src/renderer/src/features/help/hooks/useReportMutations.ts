/**
 * File: useReportMutations.ts
 * Path: src/renderer/src/features/help/hooks/useReportMutations.ts
 * Description: Writes for "Report a problem": send a report (note plus error, versions and cleaned
 *   log) through the relay, keep it on this computer when it cannot go, copy the details, and try the
 *   kept reports again when the app opens.
 */
import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import {
  PENDING_REPORTS_KEY,
  addPending,
  flushPending,
  makeReport,
  normalizePending,
  reportText,
  sendToRelay,
  type PendingReport,
} from "../utils/reports";

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

  // Kept reports go out on a later launch.
  useEffect(() => {
    const pending = normalizePending(readSetting<unknown>(PENDING_REPORTS_KEY, []));
    if (pending.length === 0) return;
    void flushPending(pending, sendToRelay).then((left) => {
      if (left.length !== pending.length) writeSetting(PENDING_REPORTS_KEY, left);
    });
  }, []);

  const send = useCallback(async (note: string) => {
    const report: PendingReport = makeReport(note, await readDetails(), new Date(), `r-${Date.now().toString(36)}`);
    let ok = false;
    try {
      ok = await sendToRelay(report);
    } catch {
      ok = false;
    }
    if (ok) setState("sent");
    else {
      const list = normalizePending(readSetting<unknown>(PENDING_REPORTS_KEY, []));
      writeSetting(PENDING_REPORTS_KEY, addPending(list, report));
      setState("kept");
    }
  }, []);

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
