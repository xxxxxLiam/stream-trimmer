import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "./serialQueue";

test("C-12: a second job starts only when the first has finished, in the order they were asked for", async () => {
  const q = createSerialQueue();
  const log: string[] = [];
  const slow = (name: string, ms: number) => () =>
    new Promise<void>((resolve) => {
      log.push(`start ${name}`);
      setTimeout(() => {
        log.push(`end ${name}`);
        resolve();
      }, ms);
    });
  await Promise.all([q.enqueue(slow("a", 30)), q.enqueue(slow("b", 1)), q.enqueue(slow("c", 1))]);
  assert.deepEqual(log, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("C-12: a job that fails does not stop the next one", async () => {
  const q = createSerialQueue();
  const first = q.enqueue(async () => {
    throw new Error("boom");
  });
  const second = q.enqueue(async () => "ok");
  await assert.rejects(first, /boom/);
  assert.equal(await second, "ok");
});
