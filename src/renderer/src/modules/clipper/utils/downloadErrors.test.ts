import assert from "node:assert/strict";
import test from "node:test";
import { saveFailure } from "./downloadErrors";

test("C-6: the engine's save codes and the Node error text both become a folder failure with a plain sentence", () => {
  assert.deepEqual(saveFailure({ code: "DISK_FULL", error: "The Clips folder is full." }), { code: "disk_full", reason: "The Clips folder is full." });
  assert.equal(saveFailure({ code: "FOLDER_NOT_WRITABLE", error: "Clipr can’t write to that folder." }).code, "save_folder_gone");
  assert.equal(saveFailure({ code: "FOLDER_GONE", error: "That folder is gone." }).reason, "That folder is gone.");
  assert.equal(saveFailure({ error: "ENOSPC: no space left on device, copyfile '/tmp/x'" }).code, "disk_full");
  assert.equal(saveFailure({ error: "ENOTDIR: not a directory, mkdir '/f/x'" }).code, "save_folder_gone");
  assert.deepEqual(saveFailure({ code: "SAVE_FAILED", error: "The clip could not be saved." }), {}, "anything else stays an ordinary failure");
});

test("a finished download's delayed reset is skipped once a newer download has started", async () => {
  const { shouldResetProgress } = await import("./downloadErrors");
  assert.equal(shouldResetProgress(1, 1), true);
  assert.equal(shouldResetProgress(1, 2), false);
});
