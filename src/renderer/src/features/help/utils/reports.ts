/**
 * File: reports.ts
 * Path: src/renderer/src/features/help/utils/reports.ts
 * Description: "Report a problem": a report is the person's note plus the error, versions and a
 *   cleaned log. It is sent through the report relay; while the relay is unreachable or not built yet
 *   it is kept on this computer and tried again on a later launch. Pure helpers plus a small store.
 */
import { redact } from "../../../shared/utils/diagnostics";

export type PendingReport = { id: string; at: string; note: string; details: string };

/** The relay address as built in: an https address, or "" for none. Anything else is ignored. */
export function relayUrlFrom(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  try {
    return new URL(text).protocol === "https:" ? text : "";
  } catch {
    return "";
  }
}

/**
 * The small relay Liam owns, set when the app is built (VITE_REPORT_RELAY_URL, see .env.example) so it
 * can be filled in later without a code change. Empty until then: every report is kept and retried later.
 */
export const REPORT_RELAY_URL = relayUrlFrom(typeof __REPORT_RELAY_URL__ === "string" ? __REPORT_RELAY_URL__ : "");
export const PENDING_REPORTS_KEY = "clipper.pendingReports";
const MAX_PENDING = 20;
const MAX_NOTE = 2000;

export function makeReport(note: string, details: string, now: Date, id: string): PendingReport {
  return {
    id,
    at: now.toISOString(),
    note: redact(note).slice(0, MAX_NOTE),
    details: redact(details),
  };
}

/** The text Copy details puts on the clipboard. */
export function reportText(r: Pick<PendingReport, "note" | "details">): string {
  return [r.note.trim() ? `What happened: ${r.note.trim()}` : "", r.details.trim()].filter(Boolean).join("\n\n");
}

export function normalizePending(raw: unknown): PendingReport[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is PendingReport => !!r && typeof r === "object" && typeof (r as PendingReport).id === "string" && typeof (r as PendingReport).note === "string" && typeof (r as PendingReport).details === "string" && typeof (r as PendingReport).at === "string")
    .slice(-MAX_PENDING);
}

export function addPending(list: readonly PendingReport[], r: PendingReport): PendingReport[] {
  return [...list.filter((x) => x.id !== r.id), r].slice(-MAX_PENDING);
}

/** Tries each kept report once; the ones that went are dropped from the list. */
export async function flushPending(
  list: readonly PendingReport[],
  send: (r: PendingReport) => Promise<boolean>,
): Promise<PendingReport[]> {
  const left: PendingReport[] = [];
  for (const r of list) {
    let ok = false;
    try {
      ok = await send(r);
    } catch {
      ok = false;
    }
    if (!ok) left.push(r);
  }
  return left;
}

/** POSTs the report to the relay. False when there is no relay or it did not accept it. */
export async function sendToRelay(r: PendingReport, url: string = REPORT_RELAY_URL): Promise<boolean> {
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: r.note, details: r.details, at: r.at }),
  });
  return res.ok;
}
