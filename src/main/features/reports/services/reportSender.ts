/**
 * File: reportSender.ts
 * Path: src/main/features/reports/services/reportSender.ts
 * Description: Sends a report to the relay, or keeps it for a later launch. With no relay address yet, or when the
 *   relay can't be reached, the report goes in the queue and nothing is said to the person. The network call is
 *   passed in, so it tests without a network.
 */
import type { RelayReport, ReportQueue } from "./reportQueue";

export interface SenderDeps {
  url: string;
  queue: ReportQueue;
  /** Resolves true when the relay accepted the report (202). Never rejects. */
  post: (url: string, report: RelayReport) => Promise<boolean>;
  makeId?: () => string;
}

export function createReportSender(d: SenderDeps) {
  const makeId = d.makeId ?? (() => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    /** "sent" when the relay took it, "kept" when it is waiting for a later launch. */
    async send(report: RelayReport): Promise<"sent" | "kept"> {
      const id = makeId();
      if (!d.url) {
        d.queue.add(id, report);
        return "kept";
      }
      if (await d.post(d.url, report).catch(() => false)) return "sent";
      d.queue.add(id, report);
      return "kept";
    },
    /** At launch: try every kept report once. Does nothing while there is no relay address. */
    async flush(): Promise<number> {
      if (!d.url) return 0;
      let sent = 0;
      for (const q of d.queue.list()) {
        if (await d.post(d.url, q.report).catch(() => false)) {
          d.queue.remove(q.id);
          sent += 1;
        } else d.queue.failed(q.id);
      }
      return sent;
    },
  };
}
