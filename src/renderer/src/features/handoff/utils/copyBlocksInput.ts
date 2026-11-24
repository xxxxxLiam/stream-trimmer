/**
 * File: copyBlocksInput.ts
 * Path: src/renderer/src/features/handoff/utils/copyBlocksInput.ts
 * Description: Builds the live `input` the Copy blocks panel needs from the shell's state
 *   (D-3: App rendered <CopyBlocks> with no input, so every block was permanently disabled
 *   and claimed "No video id found" with the video loaded).
 */
import type { HandoffInput } from "../../../shared/utils/handoff";

export type CopyBlocksState = {
  sourceUrl?: string | null;
  videoId?: string | null;
  transcript: HandoffInput["lines"] | null | undefined;
  segments: HandoffInput["segments"];
  /** Active campaign, if any: supplies the clip id pattern and prefix. */
  campaign?: { clipIdPattern: string; prefix: string } | null;
  /** The id the next cut would get (same call the Cut button uses), or null. */
  nextClipId?: string | null;
};

export function buildCopyBlocksInput(s: CopyBlocksState): HandoffInput {
  return {
    url: s.sourceUrl ?? null,
    videoId: s.videoId ?? null,
    lines: s.transcript ?? [],
    segments: s.segments,
    clipIdPattern: s.campaign?.clipIdPattern,
    clipPrefix: s.campaign?.prefix,
    clipId: s.nextClipId ?? null,
  };
}
