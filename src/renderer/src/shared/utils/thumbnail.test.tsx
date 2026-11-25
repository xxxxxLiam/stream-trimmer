/**
 * File: thumbnail.test.ts
 * Path: src/renderer/src/shared/utils/thumbnail.test.ts
 * Description: Videos rows show the video's thumbnail from i.ytimg.com, smallest size first.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import VideoThumb from "../components/VideoThumb";
import { thumbnailSources } from "./thumbnail";

test("a video id gives ytimg thumbnails, mqdefault first and never the 404-prone maxresdefault", () => {
  const s = thumbnailSources("dQw4w9WgXcQ");
  assert.equal(s[0], "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  assert.ok(s.length >= 2);
  assert.ok(s.every((u) => u.startsWith("https://i.ytimg.com/vi/") && !u.includes("maxresdefault")));
});

test("no usable id gives no thumbnail, and a bad id never builds a URL", () => {
  assert.deepEqual(thumbnailSources(null), []);
  assert.deepEqual(thumbnailSources("../etc/passwd"), []);
});

test("the thumbnail slot renders an img for a video and none without one", () => {
  assert.match(renderToStaticMarkup(<VideoThumb videoId="dQw4w9WgXcQ" />), /<img[^>]+i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/mqdefault\.jpg/);
  assert.doesNotMatch(renderToStaticMarkup(<VideoThumb videoId={null} />), /<img/);
});
