import assert from "node:assert/strict";
import test from "node:test";
import { withFinished } from "./useExportState";

test("C2-9: every clip just made keeps its own Undo window, newest first, one per file", () => {
  const a = { entryId: "a", name: "First", endsAt: 10 };
  const b = { entryId: "b", name: "Second", endsAt: 20 };
  const list = withFinished(withFinished([], a), b);
  assert.deepEqual(list.map((f) => f.name), ["Second", "First"]);
  assert.equal(withFinished(list, { ...a, name: "Again" }), list);
});
