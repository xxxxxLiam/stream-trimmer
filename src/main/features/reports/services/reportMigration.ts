/**
 * File: reportMigration.ts
 * Path: src/main/features/reports/services/reportMigration.ts
 * Description: Reports that older builds kept in the settings key `clipper.pendingReports` (the person had pressed
 *   Send; there was no relay yet) are carried once into the new queue, then the old key is cleared. Pure, so it
 *   tests without Electron.
 */
import { redact } from "../../../../common/utils/redact";
import { fitToRelay } from "./reportBuild";
import type { RelayReport, ReportQueue } from "./reportQueue";

export const LEGACY_REPORTS_KEY = "clipper.pendingReports";

interface LegacyReport {
  id: string;
  at?: string;
  note?: string;
  details?: string;
}

/** An old kept report as a relay report. Redacted again, since this text came from a settings file. */
export function legacyToRelay(r: LegacyReport, ctx: { appVersion: string; os: string; homeDir: string }): RelayReport {
  const clean = (t: string) => redact(t, { homeDir: ctx.homeDir });
  const note = clean(String(r.note ?? "")).trim().slice(0, 2000);
  const details = clean(String(r.details ?? "")).trim();
  const lines = details.split(/\r?\n/).filter((l) => l.trim());
  return fitToRelay({
    kind: "problem",
    ...(note ? { note } : {}),
    // The first line is the error text an old report began with; the rest is the log it carried.
    error: (lines[0] ?? note ?? "Report from an earlier version").slice(0, 6000) || "Report from an earlier version",
    appVersion: ctx.appVersion.slice(0, 40),
    os: ctx.os.slice(0, 80),
    log: lines.slice(1).slice(-50).map((l) => l.slice(0, 400)),
  });
}

export interface MigrationDeps {
  read: () => unknown;
  /** Removes the old key. */
  clear: () => void;
  queue: ReportQueue;
  ctx: { appVersion: string; os: string; homeDir: string };
}

/** Moves every old kept report into the queue (once: the old key is cleared), and returns how many moved. */
export function migrateLegacyReports(d: MigrationDeps): number {
  const raw = d.read();
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  const have = new Set(d.queue.list().map((q) => q.id));
  let moved = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || typeof (item as LegacyReport).id !== "string") continue;
    const old = item as LegacyReport;
    const id = `old-${old.id}`;
    if (!have.has(id)) {
      d.queue.add(id, legacyToRelay(old, d.ctx));
      moved += 1;
    }
  }
  d.clear();
  return moved;
}
