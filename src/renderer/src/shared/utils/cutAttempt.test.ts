import assert from "node:assert/strict";
import test from "node:test";
import { getCutAttempt, setCutAttempt } from "./cutAttempt";

test("C2-2: the cut's range is kept in its own copy, so clearing the marks cannot empty it", () => {
  const marked = [{ start: 4324, end: 4366 }];
  setCutAttempt({ name: "Honest Version", segments: marked });
  marked.length = 0; // pressing Clip clears the marks
  assert.deepEqual(getCutAttempt()?.segments, [{ start: 4324, end: 4366 }]);
  assert.equal(getCutAttempt()?.name, "Honest Version");
  setCutAttempt(null);
  assert.equal(getCutAttempt(), null);
});
