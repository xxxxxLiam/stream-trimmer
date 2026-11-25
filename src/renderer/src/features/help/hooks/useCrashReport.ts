/**
 * File: useCrashReport.ts
 * Path: src/renderer/src/features/help/hooks/useCrashReport.ts
 * Description: The crash screen's actions. Send report (pressing it is the consent) builds the report from the
 *   error to the main process, which adds the versions and the cleaned log, sends it through the relay and keeps
 *   it for a later launch when it cannot go. Copy details copies the same text.
 */
import { useCallback, useState } from "react";
import { makeReport, reportText, sendReport } from "../utils/reports";
import { crashDetails, reopenUrl } from "../utils/crashDetails";

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
    setState(await sendReport("crash", "", crashDetails(error, "")));
  }, [error]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText(await build()));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [build]);

  return { state, copied, send, copy, reopen: () => window.location.assign(reopenUrl(window.location.href)) };
}
