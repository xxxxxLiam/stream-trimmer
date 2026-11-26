/**
 * File: videoUrl.test.ts
 * Path: src/main/features/engine/utils/videoUrl.test.ts
 * Description: No port, or an ordinary web port (80, 443) stated outright even with the other scheme, is
 *   fine on a video link. G2-2 (downloadJobs.test.ts) found a real case: a mobile YouTube link written as
 *   "http://m.youtube.com:443/..." was being refused. An odd port (8080) stays refused
 *   (src/main/features/engine/utils/schemas.test.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isYouTubeVideoUrl } from "./youtubeUrl";
import { isKickVideoUrl, isTwitchVideoUrl } from "./videoUrl";

test("no port, or an ordinary web port even with the other scheme, is accepted", () => {
  assert.equal(isYouTubeVideoUrl("http://m.youtube.com:443/watch?v=abc"), true);
  assert.equal(isYouTubeVideoUrl("https://www.youtube.com:80/watch?v=abc"), true);
  assert.equal(isYouTubeVideoUrl("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(isTwitchVideoUrl("https://twitch.tv:443/videos/123"), true);
  assert.equal(isKickVideoUrl("https://kick.com:443/channel/videos/" + "a".repeat(8) + "-" + "b".repeat(4) + "-" + "c".repeat(4) + "-" + "d".repeat(4) + "-" + "e".repeat(12)), true);
});

test("an odd port is still refused, and a port never changes which host answers", () => {
  assert.equal(isYouTubeVideoUrl("https://www.youtube.com:8080/watch?v=abc"), false);
  assert.equal(isTwitchVideoUrl("https://twitch.tv:8080/videos/123"), false);
  // Not a real differential-parsing trick (strictHttpUrl's own tests cover those); this just confirms an
  // ordinary port does not relax the host check underneath it.
  assert.equal(isYouTubeVideoUrl("https://evil.example:443/watch?v=abc"), false);
});
