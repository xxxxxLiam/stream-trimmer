/**
 * File: handler.ts
 * Path: relay/src/handler.ts
 * Description: The crash-report relay: POST /report files a private issue in stream-trimmer (or adds a +1 comment to
 *   the open issue with the same error signature). A plain fetch(request, env) function with the network and the
 *   clock passed in, so it tests without Cloudflare or GitHub.
 */
import { stripIdentity } from "./strip";

export interface Env {
  /** Worker secret: a fine-grained token with Issues read and write on stream-trimmer only. */
  GITHUB_TOKEN?: string;
  /** Test and CLI override; defaults to the one repository the token is for. */
  GITHUB_REPO?: string;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
}

export const REPO = "xxxxxLiam/stream-trimmer";
export const CLIENT_HEADER = "X-Clipr-Client";
export const CLIENT_VALUE = "clipr-app";
export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_NOTE = 2000;
export const MAX_LOG_LINES = 50;
export const REPORTS_PER_HOUR = 5;
const MAX_ERROR = 6000;
const MAX_LOG_LINE = 400;

export interface Report {
  kind: "crash" | "problem";
  note?: string;
  error: string;
  appVersion: string;
  os: string;
  log: string[];
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The fixed shape, or null. Anything else (extra keys, wrong types, over a cap) is refused. */
export function parseReport(raw: unknown): Report | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["kind", "note", "error", "appVersion", "os", "log"]);
  if (Object.keys(r).some((k) => !allowed.has(k))) return null;
  if (r.kind !== "crash" && r.kind !== "problem") return null;
  if (typeof r.error !== "string" || !r.error.trim() || r.error.length > MAX_ERROR) return null;
  if (typeof r.appVersion !== "string" || r.appVersion.length > 40) return null;
  if (typeof r.os !== "string" || r.os.length > 80) return null;
  if (!Array.isArray(r.log) || r.log.length > MAX_LOG_LINES || r.log.some((l) => typeof l !== "string" || l.length > MAX_LOG_LINE)) return null;
  if (r.note !== undefined && (typeof r.note !== "string" || r.note.length > MAX_NOTE)) return null;
  return { kind: r.kind, note: r.note as string | undefined, error: r.error, appVersion: r.appVersion, os: r.os, log: r.log as string[] };
}

/** Error type plus the first stack frame (file name and line only), hashed: the same crash gives the same signature. */
export async function signatureOf(error: string): Promise<string> {
  const lines = error.split(/\r?\n/);
  const type = (lines[0] ?? "").replace(/[:\s].*$/, "").slice(0, 60) || "Error";
  const frame = lines.find((l) => /^\s*at\s/.test(l)) ?? "";
  const where = /([^\\/()\s]+:\d+)(?::\d+)?\)?\s*$/.exec(frame)?.[1] ?? frame.trim().slice(0, 80);
  const data = new TextEncoder().encode(`${type}|${where}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** A code fence long enough that nothing inside can close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const f = "`".repeat(longest + 1);
  return `${f}\n${text}\n${f}`;
}

function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function createRelay(deps: Deps) {
  const hits = new Map<string, number[]>();

  const limited = (ip: string): boolean => {
    const now = deps.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= REPORTS_PER_HOUR) {
      hits.set(ip, recent);
      return true;
    }
    hits.set(ip, [...recent, now]);
    return false;
  };

  return async function relay(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/report") return json(404, { error: "not_found" });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (request.headers.get(CLIENT_HEADER) !== CLIENT_VALUE) return json(403, { error: "forbidden" });

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(400, { error: "bad_request" });
    }
    const report = parseReport(parsed);
    if (!report) return json(400, { error: "bad_request" });

    if (limited(request.headers.get("CF-Connecting-IP") ?? "unknown")) return json(429, { error: "slow_down" });
    if (!env.GITHUB_TOKEN) return json(502, { error: "relay_unavailable" });

    const clean = {
      kind: report.kind,
      note: stripIdentity(report.note ?? "").trim(),
      error: stripIdentity(report.error).trim(),
      appVersion: stripIdentity(report.appVersion),
      os: stripIdentity(report.os),
      log: report.log.map((l) => stripIdentity(l)),
    };
    const signature = await signatureOf(clean.error);
    const repo = env.GITHUB_REPO || REPO;
    const gh = (path: string, init: RequestInit = {}) =>
      deps.fetch(`https://api.github.com/repos/${repo}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "clipr-relay",
          "content-type": "application/json",
        },
      });

    try {
      const label = clean.kind === "crash" ? "crash-report" : "user-report";

      // The same crash again becomes a +1 on the open issue instead of a new one.
      if (clean.kind === "crash") {
        const list = await gh(`/issues?state=open&labels=crash-report&per_page=100`);
        if (!list.ok) return json(502, { error: "relay_unavailable" });
        const open = (await list.json()) as { number: number; body?: string | null; comments?: number; pull_request?: unknown }[];
        const same = open.find((i) => !i.pull_request && (i.body ?? "").includes(`Signature: ${signature}`));
        if (same) {
          const n = (same.comments ?? 0) + 2;
          const c = await gh(`/issues/${same.number}/comments`, {
            method: "POST",
            body: JSON.stringify({ body: `+1 (report ${n})\n\nApp ${clean.appVersion} on ${clean.os}` }),
          });
          if (!c.ok) return json(502, { error: "relay_unavailable" });
          return json(202, { issue: same.number, duplicate: true });
        }
      }

      // Make the label if it is missing (a 422 means it is already there).
      await gh(`/labels`, { method: "POST", body: JSON.stringify({ name: label, color: label === "crash-report" ? "d73a4a" : "0e8a16" }) });

      const title =
        clean.kind === "crash"
          ? `Crash: ${oneLine(clean.error.split(/\r?\n/)[0] || "unknown error", 100)}`
          : `Problem: ${oneLine(clean.note || clean.error, 60)}`;
      const body = [
        `**Kind:** ${clean.kind}`,
        `**App:** ${oneLine(clean.appVersion, 40)}`,
        `**System:** ${oneLine(clean.os, 80)}`,
        clean.note ? `### What happened\n${fenced(clean.note)}` : "",
        `### Error\n${fenced(clean.error)}`,
        clean.log.length ? `### Recent activity\n${fenced(clean.log.join("\n"))}` : "",
        `Signature: ${signature}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const made = await gh(`/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: [label] }) });
      if (!made.ok) return json(502, { error: "relay_unavailable" });
      const issue = (await made.json()) as { number?: number };
      return json(202, { issue: issue.number ?? null });
    } catch {
      return json(502, { error: "relay_unavailable" });
    }
  };
}
