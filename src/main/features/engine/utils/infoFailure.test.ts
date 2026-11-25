/**
 * File: infoFailure.test.ts
 * Path: src/main/features/engine/utils/infoFailure.test.ts
 * Description: Pins what opening a failed video says: a plain sentence and a kind for each real yt-dlp string,
 *   and never the raw text or an exit code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { describeInfoFailure } from "./infoFailure";

const cases: [string, string][] = [
  ["ERROR: [youtube] a: Private video. Sign in if you've been granted access to this video\nexitCode=1", "private"],
  ["ERROR: [youtube] a: Join this channel to get access to members-only content like this video", "members"],
  ["ERROR: [youtube] a: Video unavailable. This video has been removed by the uploader", "removed"],
  ["ERROR: [youtube] a: Video unavailable. This video is not available", "removed"],
  ["ERROR: [youtube] a: Sign in to confirm your age. This video may be inappropriate for some users.", "age"],
  ["ERROR: [youtube] a: Sign in to confirm you’re not a bot. Use --cookies-from-browser", "signin"],
  ["ERROR: [youtube] a: This live event will begin in 2 hours.", "live"],
  ["ERROR: [youtube] a: Premieres in 3 hours", "live"],
  ["ERROR: [youtube] a: The uploader has not made this video available in your country", "region"],
  ["ERROR: Unable to download webpage: <urlopen error [Errno -3] Temporary failure in name resolution>", "offline"],
  ["WARNING: [youtube] HTTP Error 429: Too Many Requests", "refused"],
  ["something nobody has seen before\nexitCode=2", "unknown"],
];

for (const [raw, kind] of cases) {
  test(`opening a video: ${kind} <= ${raw.slice(0, 50)}`, () => {
    const f = describeInfoFailure(raw);
    assert.equal(f.kind, kind);
    assert.doesNotMatch(f.error, /exitCode|ERROR:|\[youtube\]|yt-dlp|Errno|at \S+ \(/);
    assert.match(f.error, /[.]$/);
  });
}
