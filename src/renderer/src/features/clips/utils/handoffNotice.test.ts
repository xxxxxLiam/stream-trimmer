import assert from "node:assert/strict";
import test from "node:test";
import type { AfterCuttingAnswer } from "../../handoff/components/EditorHandoff";
import { handoffNoticeFor } from "./handoffNotice";

const answer = (outcome: AfterCuttingAnswer["outcome"], campaignId: string | null = "acme"): AfterCuttingAnswer => ({
  outcome,
  campaignId,
  ctx: { campaignId, clips: [] },
  settings: {} as AfterCuttingAnswer["settings"],
});

test("D-3: a failed handoff is shown in error tone with the engine's reason and the clip's file", () => {
  const n = handoffNoticeFor(answer({ ok: false, message: "Final Cut Pro is not installed.", clipPath: "/c/a.mp4" }), "acme");
  assert.deepEqual(n, { tone: "error", message: "Final Cut Pro is not installed.", clipPath: "/c/a.mp4" });
});

test("D-3: an editor that opened and only showed the file says so, in info tone", () => {
  const n = handoffNoticeFor(answer({ ok: true, message: "Opened the editor and showed the clip.", clipPath: "/c/a.mp4" }), "acme");
  assert.equal(n?.tone, "info");
});

test("D-3: a send that worked says nothing, and another campaign's answer is not this one's", () => {
  assert.equal(handoffNoticeFor(answer({ ok: true, message: "Saved a.fcpxml with 1 clip." }), "acme"), null);
  assert.equal(handoffNoticeFor(answer({ ok: false, message: "No." }, "nova"), "acme"), null);
  assert.equal(handoffNoticeFor(null, "acme"), null);
});
