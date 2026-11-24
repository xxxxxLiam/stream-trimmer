/**
 * File: channelJobs.ts
 * Path: server/channel/channelJobs.ts
 * Description: Progress channel and cancel for channel export jobs.
 */
import { type Response } from "express";
import { type ChildProcess } from "node:child_process";

interface ChannelProgress {
  phase: "listing" | "metadata" | "details" | "done" | "error" | "cancelled";
  current: number;
  total: number;
  label?: string;
  message?: string;
}

export interface ChannelJob {
  clients: Set<Response>;
  last: ChannelProgress;
  cancelled: boolean;
  children: Set<ChildProcess>;
  cleanupTimer?: NodeJS.Timeout;
}

const channelJobs = new Map<string, ChannelJob>();

export function getOrCreateChannelJob(id: string): ChannelJob {
  let job = channelJobs.get(id);
  if (!job) {
    job = {
      clients: new Set(),
      last: { phase: "listing", current: 0, total: 0 },
      cancelled: false,
      children: new Set(),
    };
    channelJobs.set(id, job);
  }
  return job;
}

export function publishChannel(id: string, evt: ChannelProgress) {
  const job = getOrCreateChannelJob(id);
  job.last = evt;
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      /* ignore */
    }
  }
  if (evt.phase === "done" || evt.phase === "error" || evt.phase === "cancelled") {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => {
      for (const c of job.clients) {
        try {
          c.end();
        } catch {
          /* ignore */
        }
      }
      channelJobs.delete(id);
    }, 5000);
  }
}

export function cancelChannelJob(jobId: string) {
  const job = channelJobs.get(jobId);
  if (!job) return;
  job.cancelled = true;
  for (const child of job.children) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  job.children.clear();
}
