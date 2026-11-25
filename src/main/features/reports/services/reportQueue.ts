/**
 * File: reportQueue.ts
 * Path: src/main/features/reports/services/reportQueue.ts
 * Description: The reports waiting for a launch to try again, in a file in the user data folder. At most 20; the
 *   oldest goes first when full. Pure Node, so it tests without Electron.
 */
import fs from "node:fs";
import path from "node:path";
import { MAX_ATTEMPTS, MAX_QUEUED } from "./relayConfig";

export interface RelayReport {
  kind: "crash" | "problem";
  note?: string;
  error: string;
  appVersion: string;
  os: string;
  log: string[];
}

export interface QueuedReport {
  id: string;
  report: RelayReport;
  /** Launches that have tried and failed. */
  attempts: number;
}

export function createReportQueue(file: string) {
  const read = (): QueuedReport[] => {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(raw)
        ? raw.filter((q): q is QueuedReport => !!q && typeof q.id === "string" && Number.isInteger(q.attempts) && !!q.report && typeof q.report.error === "string")
        : [];
    } catch {
      return [];
    }
  };
  const write = (list: QueuedReport[]) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(list));
      fs.renameSync(tmp, file);
    } catch {
      /* a queue that cannot be written must never break the app */
    }
  };
  return {
    list: read,
    add(id: string, report: RelayReport): void {
      write([...read().filter((q) => q.id !== id), { id, report, attempts: 0 }].slice(-MAX_QUEUED));
    },
    remove(id: string): void {
      write(read().filter((q) => q.id !== id));
    },
    /** One more launch failed to send it; it is dropped once it has failed MAX_ATTEMPTS times. */
    failed(id: string): void {
      write(
        read()
          .map((q) => (q.id === id ? { ...q, attempts: q.attempts + 1 } : q))
          .filter((q) => q.attempts < MAX_ATTEMPTS),
      );
    },
  };
}

export type ReportQueue = ReturnType<typeof createReportQueue>;
