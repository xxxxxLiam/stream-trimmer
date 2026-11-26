import assert from "node:assert/strict";
import test from "node:test";
import { onMakeRequest, requestMake } from "./makeRequest";

const r = { campaignId: "c", videoId: "v", clipId: "A1" };

test("a request goes to the panel that owns the video; one made before any panel exists waits for it", () => {
  const got: string[] = [];
  requestMake(r); // Export is not on screen yet
  const off = onMakeRequest((x) => (x.videoId === "v" ? (got.push(x.clipId), true) : false));
  assert.deepEqual(got, ["A1"]);
  requestMake({ ...r, clipId: "A2" });
  assert.deepEqual(got, ["A1", "A2"]);
  off();
});

test("a panel for another video does not take it", () => {
  const got: string[] = [];
  const off = onMakeRequest((x) => (x.videoId === "other" ? (got.push(x.clipId), true) : false));
  requestMake({ ...r, clipId: "B1" });
  assert.deepEqual(got, []);
  const off2 = onMakeRequest(() => true); // drains the waiting one
  off();
  off2();
});
