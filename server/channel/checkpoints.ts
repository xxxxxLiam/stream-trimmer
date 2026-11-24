/**
 * File: checkpoints.ts
 * Path: server/channel/checkpoints.ts
 * Description: Per-video checkpoint files for a channel export, so a rerun resumes where it stopped.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Live checkpoints. They get their own prefix, deliberately NOT EXPORT_PREFIX:
// "ytchan-" is what the resume cache's Clear button sweeps, and that sweep
// used to delete a running export's files out from under it. "ytchan-" stays
// for the finished CSV folders, which is what export:save expects.
// ---------------------------------------------------------------------------
export const CHECKPOINT_PREFIX = "ytchanwip-";
const CHECKPOINT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** Checkpoint folders owned by a request that is running right now. */
export const activeCheckpoints = new Set<string>();

export class CheckpointLostError extends Error {
  constructor(file: string) {
    super(
      `The export's working folder disappeared mid-run (${path.basename(file)}), so the result would be incomplete. Nothing was saved. Run it again.`,
    );
  }
}

/**
 * Append to a live checkpoint, loudly. The file is created up front, so one
 * that is missing now has been deleted, and appending would quietly start a
 * new file that holds only what came after.
 */
export function appendCheckpoint(file: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  if (!fs.existsSync(file)) throw new CheckpointLostError(file);
  try {
    fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT")
      throw new CheckpointLostError(file);
    throw e;
  }
}

export function sweepStaleCheckpoints(): void {
  const root = os.tmpdir();
  try {
    for (const n of fs.readdirSync(root)) {
      if (!n.startsWith(CHECKPOINT_PREFIX)) continue;
      const dir = path.join(root, n);
      try {
        if (fs.statSync(dir).mtimeMs < Date.now() - CHECKPOINT_STALE_MS)
          fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* in use or already gone */
      }
    }
  } catch {
    /* no temp dir to read */
  }
}
