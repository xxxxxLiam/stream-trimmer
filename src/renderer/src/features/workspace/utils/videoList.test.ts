import assert from "node:assert/strict";
import test from "node:test";
import { matchesVideoQuery, nextOpenId, nextWaitingId, setDone, splitVideos, waitingIn, looksLikeLink, linkKind, linkInText, resolveLink, NOT_A_LINK, NOT_A_VIDEO } from "./videoList";
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

test("B2-5: the video link inside pasted share text is pulled out", () => {
  assert.equal(linkInText("Watch this! https://youtu.be/abc123 – so good"), "https://youtu.be/abc123");
  assert.equal(linkInText("check (m.youtube.com/watch?v=abc123), wow"), "m.youtube.com/watch?v=abc123");
  assert.equal(linkInText("just some words"), null);
  assert.equal(linkInText("see https://example.com/page"), null);
});

test("resolveLink: Enter in the top bar field opens a video link, reuses an open one, or says what is wrong", () => {
  const tabs = [tab("a", { url: "https://youtu.be/dQw4w9WgXcQ" }), tab("b", { url: "https://youtu.be/aaaaaaaaaaa", done: true })];
  assert.deepEqual(resolveLink("   ", tabs), { kind: "empty" });
  assert.deepEqual(resolveLink("honest version", tabs), { kind: "error", message: NOT_A_LINK });
  assert.deepEqual(resolveLink("https://example.com/x", tabs), { kind: "error", message: NOT_A_VIDEO });
  assert.deepEqual(resolveLink("https://youtu.be/bbbbbbbbbbb", tabs), { kind: "open", target: "https://youtu.be/bbbbbbbbbbb", existingId: null, reopen: false });
  assert.deepEqual(resolveLink("youtube.com/watch?v=dQw4w9WgXcQ", tabs), { kind: "open", target: "youtube.com/watch?v=dQw4w9WgXcQ", existingId: "a", reopen: false });
  // A video already in Done comes back out of Done.
  assert.deepEqual(resolveLink("https://youtu.be/aaaaaaaaaaa", tabs), { kind: "open", target: "https://youtu.be/aaaaaaaaaaa", existingId: "b", reopen: true });
  // Share text keeps only its link.
  const shared = resolveLink("Watch this https://youtu.be/bbbbbbbbbbb – wow", tabs);
  assert.equal(shared.kind === "open" && shared.target, "https://youtu.be/bbbbbbbbbbb");
});

test("Liam 28 Nov: the Videos list sorts by latest activity, newest first", async () => {
  const { byLatestActivity } = await import("./videoList");
  const A = { id: "a", url: "https://youtu.be/aaaaaaaaaaa", addedAt: 100 };
  const B = { id: "b", url: "https://youtu.be/bbbbbbbbbbb", addedAt: 200 };
  const C = { id: "c", url: "https://youtu.be/ccccccccccc" }; // from an older save: no time
  const D = { id: "d", url: "https://youtu.be/ddddddddddd" };
  const none = () => 0;
  assert.deepEqual(byLatestActivity([A, B, C, D], none).map((t) => t.id), ["b", "a", "c", "d"], "added later goes higher; no time keeps its order below");
  assert.deepEqual(byLatestActivity([A, B, C, D], (v) => (v === "aaaaaaaaaaa" ? 300 : 0)).map((t) => t.id), ["a", "b", "c", "d"], "clipped from: to the top");
  assert.deepEqual(byLatestActivity([A, B, C, D], (v) => (v === "ddddddddddd" ? 999 : 0)).map((t) => t.id), ["d", "b", "a", "c"], "an old unstamped video clipped from jumps up");
  assert.deepEqual(byLatestActivity([A, B], (v) => (v === "aaaaaaaaaaa" ? 50 : 0)).map((t) => t.id), ["b", "a"], "an older clip does not lower a later add");
});
