/**
 * File: useCrashReport.ts
 * Path: src/renderer/src/features/help/hooks/useCrashReport.ts
 * Description: The crash screen's actions. Send report (pressing it is the consent) builds the report from the
 *   error plus the cleaned diagnostics and sends it through the relay; when it cannot go, the report is queued in
 *   the same pending list Report a problem uses, and a later launch retries it. Copy details copies the same text.
 */
import { useCallback, useState } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { PENDING_REPORTS_KEY, addPending, makeReport, normalizePending, reportText, sendToRelay } from "../utils/reports";
import { crashDetails } from "../utils/crashDetails";

async function diagnostics(): Promise<string> {
  try {
    return (await window.electronAPI?.readDiagnostics?.())?.text ?? "";
  } catch {
    return "";
  }
}

export function useCrashReport(error: Error) {
  const [state, setState] = useState<"idle" | "sent" | "kept">("idle");
  const [copied, setCopied] = useState(false);

  const build = useCallback(async () => makeReport("", crashDetails(error, await diagnostics()), new Date(), `c-${Date.now().toString(36)}`), [error]);

  const send = useCallback(async () => {
    const report = await build();
    let ok = false;
    try {
      ok = await sendToRelay(report);
    } catch {
      ok = false;
    }
    if (ok) return setState("sent");
    writeSetting(PENDING_REPORTS_KEY, addPending(normalizePending(readSetting<unknown>(PENDING_REPORTS_KEY, [])), report));
    setState("kept");
  }, [build]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText(await build()));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [build]);

  return { state, copied, send, copy, reopen: () => window.location.reload() };
}
