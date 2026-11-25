/**
 * File: reportBuild.ts
 * Path: src/main/features/reports/services/reportBuild.ts
 * Description: Builds what the relay receives: the person's note, the error, the app and system version and the last
 *   few log lines, with the home folder and credentials removed. No video link goes in. Pure.
 */
import { redact } from "../../../../common/utils/redact";
import type { RelayReport } from "./reportQueue";

export interface ReportInput {
  kind: "crash" | "problem";
  note?: string;
  error: string;
}

export interface ReportContext {
  appVersion: string;
  os: string;
  homeDir: string;
  /** The log's recent lines, as they are on disk. */
  logTail: string;
}

const VIDEO_LINK = /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com)[^\s"'<>)]*/gi;
const clean = (text: string, homeDir: string) => redact(text, { homeDir }).replace(VIDEO_LINK, "<video link>");

/** The input as the IPC received it, or null when it is not a report. */
export function validInput(raw: unknown): ReportInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "crash" && r.kind !== "problem") return null;
  if (typeof r.error !== "string" || !r.error.trim()) return null;
  if (r.note !== undefined && typeof r.note !== "string") return null;
  return { kind: r.kind, note: r.note as string | undefined, error: r.error };
}

export function buildReport(input: ReportInput, ctx: ReportContext): RelayReport {
  const log = ctx.logTail
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-50)
    .map((l) => clean(l, ctx.homeDir).slice(0, 400));
  return {
    kind: input.kind,
    ...(input.kind === "problem" && input.note?.trim() ? { note: clean(input.note, ctx.homeDir).trim().slice(0, 2000) } : {}),
    error: clean(input.error, ctx.homeDir).trim().slice(0, 6000),
    appVersion: ctx.appVersion.slice(0, 40),
    os: ctx.os.slice(0, 80),
    log,
  };
}
