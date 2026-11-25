/**
 * File: reportService.ts
 * Path: src/main/features/reports/services/reportService.ts
 * Description: Wires the report sender to this app: the user data folder for the queue, the scrubbed log, the
 *   version, and a real POST to the relay.
 */
import os from "node:os";
import path from "node:path";
import electron from "electron";
import { readLogScrubbed } from "../../diagnostics/services/diagnosticsService";
import { buildReport, validInput } from "./reportBuild";
import { createReportQueue, type RelayReport } from "./reportQueue";
import { createReportSender } from "./reportSender";
import { getSettings } from "../../settings/services/settingsService";
import { LEGACY_REPORTS_KEY, migrateLegacyReports } from "./reportMigration";
import { RELAY_CLIENT_HEADER, RELAY_CLIENT_VALUE, RELAY_URL } from "./relayConfig";

const { app } = electron;

async function post(url: string, report: RelayReport): Promise<boolean> {
  const res = await fetch(`${url.replace(/\/+$/, "")}/report`, {
    method: "POST",
    headers: { "content-type": "application/json", [RELAY_CLIENT_HEADER]: RELAY_CLIENT_VALUE },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(15_000),
  });
  return res.status === 202;
}

let sender: ReturnType<typeof createReportSender> | null = null;
function getSender() {
  return (sender ??= createReportSender({
    url: RELAY_URL,
    queue: createReportQueue(path.join(app.getPath("userData"), "pending-reports.json")),
    post,
  }));
}

/** Send Report (crash screen) and Report a problem (Help). Pressing the button is the consent. */
export async function sendReport(raw: unknown): Promise<{ ok: boolean; status?: "sent" | "kept" }> {
  const input = validInput(raw);
  if (!input) return { ok: false };
  const report = buildReport(input, {
    appVersion: app.getVersion(),
    os: `${process.platform} ${os.release()}`,
    homeDir: os.homedir(),
    logTail: readLogScrubbed(60),
  });
  return { ok: true, status: await getSender().send(report) };
}

/** Reports an older build kept in settings go into the queue once (E2-7). */
function carryOldReports(): void {
  const settings = getSettings();
  if (!settings) return;
  try {
    migrateLegacyReports({
      read: () => settings.all()[LEGACY_REPORTS_KEY],
      clear: () => settings.set(LEGACY_REPORTS_KEY, null),
      queue: createReportQueue(path.join(app.getPath("userData"), "pending-reports.json")),
      ctx: { appVersion: app.getVersion(), os: `${process.platform} ${os.release()}`, homeDir: os.homedir() },
    });
  } catch {
    /* a failed carry-over must never stop the app starting; the old list stays for the next launch */
  }
}

/** At launch: tries the reports kept from earlier. */
export function flushPendingReports(): void {
  carryOldReports();
  void getSender().flush();
}
