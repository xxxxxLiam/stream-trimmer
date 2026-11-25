import assert from "node:assert/strict";
import test from "node:test";
import { clipNameFor } from "./cutNaming";

test("C-1: the name typed on the lane (or suggested) is the clip's name, not a campaign pattern id", () => {
  assert.equal(clipNameFor({ candidates: ["Story Never"], videoTitle: "Podcast 214", taken: [] }), "Story Never");
});

test("C-1: with nothing on the lane the name comes from the video's title, then 'New clip'", () => {
  assert.equal(clipNameFor({ candidates: [null], videoTitle: "Honest Money Talk", taken: [] }), "Honest Money");
  assert.equal(clipNameFor({ candidates: [undefined], videoTitle: "", taken: [] }), "New clip");
});

test("C-1: a name that breaks the two-word rule is skipped for the next candidate", () => {
  assert.equal(clipNameFor({ candidates: ["Way too many words", "Short Name"], taken: [] }), "Short Name");
});

test("C-1: a repeat gets 2, then 3", () => {
  assert.equal(clipNameFor({ candidates: ["Story Never"], taken: ["story never"] }), "Story Never 2");
  assert.equal(clipNameFor({ candidates: ["Story Never"], taken: ["Story Never", "Story Never 2"] }), "Story Never 3");
});
