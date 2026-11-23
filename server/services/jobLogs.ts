/**
 * File: jobLogs.ts
 * Path: server/services/jobLogs.ts
 * Description: Keeps each job's own log lines in a small in-memory ring so a failure can hand the renderer exactly its lines.
 */


// --- per-run diagnostics -----------------------------------------------------
// Every log line that names a job (`job=<id>`) is also kept in a small in-memory
// ring keyed by that id, so a failure can hand the renderer exactly its own
// lines instead of the whole log. Bounded in both directions.
const JOB_LOG_MAX_LINES = 300;
const JOB_LOG_MAX_JOBS = 40;
export const jobLogs = new Map<string, string[]>();
{
  const levels = ["log", "warn", "error"] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        const text = args
          .map((a) => (typeof a === "string" ? a : String(a)))
          .join(" ");
        const m = /\bjob=(job_[\w]+)/.exec(text);
        if (!m) return;
        let lines = jobLogs.get(m[1]);
        if (!lines) {
          lines = [];
          jobLogs.set(m[1], lines);
          if (jobLogs.size > JOB_LOG_MAX_JOBS) {
            const oldest = jobLogs.keys().next().value;
            if (oldest !== undefined) jobLogs.delete(oldest);
          }
        }
        lines.push(`${new Date().toISOString()} [${level}] ${text.slice(0, 600)}`);
        if (lines.length > JOB_LOG_MAX_LINES) lines.shift();
      } catch {
        /* capturing a line must never break logging */
      }
    };
  }
}
