/**
 * File: frameIdentity.ts
 * Path: src/main/features/engine/testSupport/frameIdentity.ts
 * Description: Test helper that says WHICH source frame every frame of a clip
 * came from. A duration that merely looks right proves nothing about content,
 * so each decoded frame is reduced to a small grayscale thumbnail and matched to
 * its nearest source frame. A stream-copied frame matches itself exactly
 * (distance 0); a re-encoded one matches within a small distance while every
 * other source frame is far away, which the fixture guarantees (it carries a
 * moving counter, so all 750 thumbnails are distinct).
 */
import { spawnSync } from "node:child_process";

const W = 32;
const H = 18;
const FRAME_BYTES = W * H;

/** Decodes every video frame of `file` into 32x18 gray thumbnails. */
export function thumbnails(ffmpeg: string, file: string): Buffer[] {
  const r = spawnSync(
    ffmpeg,
    [
      "-v", "error", "-i", file, "-an", "-fps_mode", "passthrough",
      "-vf", `scale=${W}:${H}:flags=area,format=gray`,
      "-f", "rawvideo", "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  if (r.status !== 0) throw new Error(`decode failed: ${r.stderr}`);
  const out: Buffer[] = [];
  for (let i = 0; i + FRAME_BYTES <= r.stdout.length; i += FRAME_BYTES) {
    out.push(r.stdout.subarray(i, i + FRAME_BYTES));
  }
  return out;
}

function distance(a: Buffer, b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < FRAME_BYTES; i++) sum += Math.abs(a[i] - b[i]);
  return sum / FRAME_BYTES;
}

export interface Attribution {
  /** For each clip frame, the index of its nearest source frame. */
  indices: number[];
  /** Worst nearest-distance seen, and the gap to the runner-up (ambiguity). */
  worstDistance: number;
  minMargin: number;
}

export function attribute(source: Buffer[], clip: Buffer[]): Attribution {
  const indices: number[] = [];
  let worstDistance = 0;
  let minMargin = Infinity;
  for (const frame of clip) {
    let best = -1;
    let bestD = Infinity;
    let second = Infinity;
    for (let i = 0; i < source.length; i++) {
      const d = distance(frame, source[i]);
      if (d < bestD) {
        second = bestD;
        bestD = d;
        best = i;
      } else if (d < second) second = d;
    }
    indices.push(best);
    worstDistance = Math.max(worstDistance, bestD);
    minMargin = Math.min(minMargin, second - bestD);
  }
  return { indices, worstDistance, minMargin };
}
