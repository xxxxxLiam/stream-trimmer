import assert from "node:assert/strict";
import test from "node:test";
import { FOLDER_FAILURE, folderProblem } from "./folderCheck";

test("only a clear answer counts; anything else never blocks a clip", () => {
  assert.equal(folderProblem({ ok: false, problem: "gone" }), "gone");
  assert.equal(folderProblem({ ok: false, problem: "refused" }), "refused");
  assert.equal(folderProblem({ ok: true }), null);
  assert.equal(folderProblem(null), null);
  assert.equal(folderProblem({ ok: false }), null);
  assert.equal(folderProblem({ ok: false, problem: "weird" }), null);
});

test("each problem becomes the failure code its row keys on", () => {
  assert.equal(FOLDER_FAILURE.gone.code, "save_folder_gone");
  assert.equal(FOLDER_FAILURE.refused.code, "folder_not_writable");
});
