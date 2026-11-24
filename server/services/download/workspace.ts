/**
 * File: workspace.ts
 * Path: server/services/download/workspace.ts
 * Description: The two work folders of a run (resumable shared one and the private clip one) and the release of both.
 */
import fs from "node:fs";
import path from "node:path";
import { segmentFileName } from "../../segments";
import { CLIP_PREFIX, jobDir, markInUse, partialBytes, tryClaim, workDir } from "../../resumeCache";
import { DownloadCtx } from "./jobContext";

export interface Workspace {
  clipDir: string;
  tempDir: string;
  outputPath: string;
  segFiles: string[];
  listPath: string;
  /** The whole-file source the fallback path downloads. */
  fullPath: string;
  resumeBytes: number;
  releaseWork: (keepClip: boolean) => void;
  cleanup: () => void;
}

export function createWorkspace(ctx: DownloadCtx): Workspace {
  const { url, format, quality, segs, multi, jobId, isAudio, ext } = ctx;
  // Two folders, because two different things have to survive:
  //  - the SHARED folder is keyed by video+format+quality+ranges, so yt-dlp's
  //    `.part` files and a whole-file source outlive a failure and the retry
  //    continues from where it stopped. Only one live job may use it at a time
  //    (a second one with the same key works privately, with no resume), since
  //    two yt-dlp runs must never write the same `.part`.
  //  - the CLIP folder belongs to this request alone (key + random suffix). The
  //    finished clip, the concat list and the join output live there, so a
  //    second download of the same clip, however it arrives, can neither delete
  //    them nor have its own deleted. The app's main process moves the clip out
  //    and removes this folder.
  const keyParts = multi
    ? [
        url,
        format,
        quality,
        "segments",
        ...segs.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
      ]
    : [url, format, quality, segs[0].start.toFixed(2), segs[0].end.toFixed(2)];
  const sharedDir = workDir(CLIP_PREFIX, keyParts);
  const releaseShared = tryClaim(sharedDir);
  const clipDir = jobDir(CLIP_PREFIX, keyParts);
  const releaseClipDir = markInUse(clipDir);
  // Where segment files, `.part` files and the whole-file source go.
  const tempDir = releaseShared ? sharedDir : clipDir;
  if (!releaseShared) {
    console.log(
      `[server] /api/download job=${jobId} same clip already downloading — working in a private folder`,
    );
  }
  const outputPath = path.join(clipDir, `clip.${ext}`);
  // Per-segment files and the join's inputs. Every segment, a lone one too,
  // is written into the resumable folder, never straight into the per-request
  // clip folder: a failure deletes that whole folder, and with it the `.part`
  // a retry would continue from. A lone segment is moved to outputPath once
  // it is complete (see buildClip).
  const segFiles = segs.map((_, i) => path.join(tempDir, segmentFileName(i, ext)));
  const listPath = path.join(clipDir, "list.txt");
  // A finished clip left from a previous run is never reused — only partials.
  for (const f of [outputPath, listPath, ...segFiles]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
  const resumeBytes = partialBytes(tempDir);
  if (resumeBytes > 0) {
    console.log(
      `[server] /api/download resuming with ${resumeBytes} cached byte(s) in ${tempDir}`,
    );
  }
  // Ends this job's claim on both folders. `keepClip` leaves the clip folder in
  // place (the finished clip is being handed over); otherwise it is removed.
  let workReleased = false;
  const releaseWork = (keepClip: boolean) => {
    if (workReleased) return;
    workReleased = true;
    if (!keepClip) {
      try {
        fs.rmSync(clipDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    releaseClipDir();
    releaseShared?.();
    // The shared folder is dropped once nothing resumable is left in it.
    try {
      fs.rmdirSync(sharedDir);
    } catch {
      /* not empty: partials a retry will resume from */
    }
  };
  const cleanup = () => releaseWork(false);

  const fullPath = path.join(tempDir, `source.${isAudio ? "m4a" : "mp4"}`);
  return {
    clipDir,
    tempDir,
    outputPath,
    segFiles,
    listPath,
    fullPath,
    resumeBytes,
    releaseWork,
    cleanup,
  };
}
