/**
 * File: downloadJobs.ts
 * Path: server/services/downloadJobs.ts
 * Description: The registry of cancellable download jobs and the process-tree kill.
 */
import { spawn, type ChildProcess } from "node:child_process";

// --- cancellable download jobs ----------------------------------------------
//
// Every /api/download request registers here under its jobId for as long as it
// is being built. POST /api/download/cancel?jobId=… (or the client simply
// hanging up) kills every child the job has started and makes the job stop
// before it starts the next one.

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

interface ActiveJob {
  cancelled: boolean;
  /** True while the clip is being built; false once it is finished or failed. */
  building: boolean;
  children: Set<ChildProcess>;
}

const activeJobs = new Map<string, Set<ActiveJob>>();

export function registerJob(id: string): ActiveJob {
  const job: ActiveJob = { cancelled: false, building: true, children: new Set() };
  let set = activeJobs.get(id);
  if (!set) {
    set = new Set();
    activeJobs.set(id, set);
  }
  set.add(job);
  return job;
}

export function unregisterJob(id: string, job: ActiveJob) {
  job.building = false;
  const set = activeJobs.get(id);
  if (!set) return;
  set.delete(job);
  if (set.size === 0) activeJobs.delete(id);
}

/** Kills a child and, where it leads its own process group, everything under it. */
export function killTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export function cancelJobRun(job: ActiveJob) {
  job.cancelled = true;
  for (const child of job.children) killTree(child);
}

/** Cancels every live job with this id. Returns how many were still building. */
export function cancelJob(id: string): number {
  let n = 0;
  for (const job of activeJobs.get(id) ?? []) {
    if (!job.building) continue;
    cancelJobRun(job);
    n += 1;
  }
  return n;
}
