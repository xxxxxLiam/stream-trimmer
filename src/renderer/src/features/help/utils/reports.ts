/**
 * File: reports.ts
 * Path: src/renderer/src/features/help/utils/reports.ts
 * Description: "Report a problem": a report is the person's note plus the error, versions and a
 *   cleaned log. The main process sends it through the report relay and keeps it for a later launch
 *   when the relay can't be reached; this file only builds the text and asks main to send.
 */
import { redact } from "../../../shared/utils/diagnostics";

export type PendingReport = { id: string; at: string; note: string; details: string };

export const MAX_NOTE = 2000;

/** Cuts to `max` whole characters, so an emoji (a surrogate pair, or a joined sequence) is never split in half. */
export function cutNote(text: string, max: number): string {
  if (text.length <= max) return text;
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  const parts = Seg ? Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (x) => x.segment) : Array.from(text);
  let out = "";
  for (const g of parts) {
    if (out.length + g.length > max) break;
    out += g;
  }
  return out;
}

export function makeReport(note: string, details: string, now: Date, id: string): PendingReport {
  return {
    id,
    at: now.toISOString(),
    note: cutNote(redact(note), MAX_NOTE),
    details: redact(details),
  };
}

/** The text Copy details puts on the clipboard. */
export function reportText(r: Pick<PendingReport, "note" | "details">): string {
  return [r.note.trim() ? `What happened: ${r.note.trim()}` : "", r.details.trim()].filter(Boolean).join("\n\n");
}

/** What a send came to: "sent" went out now, "kept" is queued by the main process for a later launch. */
export type SendOutcome = "sent" | "kept";

/**
 * Sends through the main process (IPC `sendReport`): it adds the app and system version and the cleaned log,
 * queues the report when the relay can't be reached, and retries on a later launch. Outside the desktop app there
 * is no relay, so the report stays only on this screen's Copy details and is called kept.
 */
export async function sendReport(kind: "crash" | "problem", note: string, error: string): Promise<SendOutcome> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.sendReport) return "kept";
  try {
    const r = await api.sendReport({ kind, note: kind === "problem" ? cutNote(redact(note), MAX_NOTE) : undefined, error: redact(error).trim() || "No error text" });
    return r.ok && r.status === "sent" ? "sent" : "kept";
  } catch {
    return "kept";
  }
}
