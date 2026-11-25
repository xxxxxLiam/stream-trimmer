import assert from "node:assert/strict";
import test from "node:test";
import { matchesVideoQuery, nextOpenId, nextWaitingId, setDone, splitVideos, waitingIn, looksLikeLink, linkKind } from "./videoList";
import type { WorkspaceTab } from "../hooks/WorkspaceContext";
import type { BankData } from "../../../shared/utils/bank";

const tab = (id: string, extra: Partial<WorkspaceTab> = {}): WorkspaceTab => ({ id, name: "", ...extra });

test("setDone marks one tab and clears it again", () => {
  const tabs = [tab("a"), tab("b")];
  const done = setDone(tabs, "a", true);
  assert.equal(done[0].done, true);
  assert.equal(done[1].done, undefined);
  assert.equal(setDone(done, "a", false)[0].done, undefined);
});

test("splitVideos keeps order and separates Done", () => {
  const { open, done } = splitVideos([tab("a"), tab("b", { done: true }), tab("c")]);
  assert.deepEqual(open.map((t) => t.id), ["a", "c"]);
  assert.deepEqual(done.map((t) => t.id), ["b"]);
});

test("nextOpenId picks the next open video, wrapping, or null when none is left", () => {
  const tabs = [tab("a"), tab("b", { done: true }), tab("c")];
  assert.equal(nextOpenId(tabs, "a"), "c");
  assert.equal(nextOpenId(tabs, "c"), "a");
  assert.equal(nextOpenId([tab("a")], "a"), null);
});

test("waitingIn counts only banked moments of that campaign and video", () => {
  const data: BankData = {
    acme: {
      abc: [
        { id: "1", label: "", segments: [{ start: 0, end: 5 }], status: "banked" },
        { id: "2", label: "", segments: [{ start: 0, end: 5 }], status: "cut" },
      ],
    },
  };
  assert.equal(waitingIn(data, "acme", "abc"), 1);
  assert.equal(waitingIn(data, "nova", "abc"), 0);
  assert.equal(waitingIn(data, undefined, "abc"), 0);
});

test("matchesVideoQuery matches title or campaign, every word", () => {
  assert.equal(matchesVideoQuery("Podcast #214", "Acme", "pod acme"), true);
  assert.equal(matchesVideoQuery("Podcast #214", "Acme", "nova"), false);
  assert.equal(matchesVideoQuery("Podcast #214", "Acme", "  "), true);
});

test("looksLikeLink tells a pasted link from search words", () => {
  assert.equal(looksLikeLink("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(looksLikeLink("youtu.be/abc"), true);
  assert.equal(looksLikeLink("founder story"), false);
});

test("nextWaitingId skips Done videos and ones with nothing waiting, and wraps", () => {
  const tabs = [tab("a"), tab("b", { done: true }), tab("c"), tab("d")];
  const waiting = (t: WorkspaceTab) => (t.id === "a" || t.id === "b" ? 2 : t.id === "d" ? 1 : 0);
  assert.equal(nextWaitingId(tabs, "a", waiting), "d");
  assert.equal(nextWaitingId(tabs, "d", waiting), "a");
  assert.equal(nextWaitingId(tabs, "a", () => 0), null);
});

test("B-5: a YouTube link without https:// is a link, not a search word", () => {
  assert.equal(linkKind("m.youtube.com/watch?v=abc123"), "video");
  assert.equal(linkKind("music.youtube.com/watch?v=abc123"), "video");
  assert.equal(linkKind("youtu.be/abc123"), "video");
  assert.equal(linkKind("https://www.youtube.com/watch?v=abc123"), "video");
  assert.equal(linkKind("founder story"), "none");
  assert.equal(linkKind("youtube tips"), "none");
});

test("B-6: a link that is not a YouTube video is flagged, not opened", () => {
  assert.equal(linkKind("https://example.com/video"), "bad");
  assert.equal(linkKind("https://www.youtube.com/@somechannel"), "bad");
  assert.equal(linkKind("www.vimeo.com/123"), "bad");
});

test("the moment being made is not counted as waiting", () => {
  const data = {
    acme: {
      v1: [
        { id: "a", label: "", segments: [{ start: 1, end: 9 }], status: "banked" },
        { id: "b", label: "", segments: [{ start: 20, end: 29 }], status: "banked" },
        { id: "c", label: "", segments: [{ start: 40, end: 49 }], status: "banked" },
      ],
    },
  } as unknown as Parameters<typeof waitingIn>[0];
  assert.equal(waitingIn(data, "acme", "v1"), 3);
  assert.equal(waitingIn(data, "acme", "v1", "b"), 2);
});

test("a video just moved to Done goes first among the Done videos", () => {
  const tabs = [
    { id: "a", name: "" },
    { id: "c", name: "", done: true },
    { id: "b", name: "" },
    { id: "d", name: "", done: true },
  ];
  assert.deepEqual(splitVideos(setDone(tabs, "b", true)).done.map((t) => t.id), ["b", "c", "d"]);
  assert.deepEqual(splitVideos(setDone(tabs, "b", true)).open.map((t) => t.id), ["a"]);
  assert.deepEqual(splitVideos(setDone([{ id: "x", name: "" }, { id: "y", name: "" }], "x", true)).done.map((t) => t.id), ["x"]);
});
