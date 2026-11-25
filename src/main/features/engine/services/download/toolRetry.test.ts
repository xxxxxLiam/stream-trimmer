/**
 * File: toolRetry.test.ts
 * Path: src/main/features/engine/services/download/toolRetry.test.ts
 * Description: The tool-update retry happens once, only for tool errors, and never loops.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { RETRY_SPENT, runWithToolRetry } from "./toolRetry";

const toolErr = () => Object.assign(new Error("unable to extract"), {});
function harness(opts: { updated?: boolean; failures?: number } = {}) {
  const log = { builds: 0, updates: 0, retrying: 0 };
  let remaining = opts.failures ?? 1;
  const run = () =>
    runWithToolRetry(
      async () => {
        log.builds += 1;
        if (remaining-- > 0) throw toolErr();
        return "clip";
      },
      {
        isToolError: (e) => /unable to extract/.test(String((e as Error).message)),
        update: async (willUpdate) => {
          log.updates += 1;
          if (opts.updated ?? true) willUpdate();
          return opts.updated ?? true;
        },
        onRetrying: () => (log.retrying += 1),
      },
    );
  return { run, log };
}

test("a tool failure updates the tools once and the retry succeeds", async () => {
  const h = harness({ failures: 1 });
  assert.equal(await h.run(), "clip");
  assert.deepEqual(h.log, { builds: 2, updates: 1, retrying: 1 });
});

test("if the retry also fails it stops there: one retry, no loop, marked spent", async () => {
  const h = harness({ failures: 99 });
  await assert.rejects(h.run(), (e: any) => e[RETRY_SPENT] === true);
  assert.deepEqual(h.log, { builds: 2, updates: 1, retrying: 1 });
});

test("when there is nothing newer to install there is no retry and the failure is final", async () => {
  const h = harness({ failures: 99, updated: false });
  await assert.rejects(h.run(), (e: any) => e[RETRY_SPENT] === true);
  assert.deepEqual(h.log, { builds: 1, updates: 1, retrying: 0 });
});

test("an error that is not a tool error is never retried and the tools are not touched", async () => {
  const log = { updates: 0 };
  await assert.rejects(
    runWithToolRetry(async () => { throw new Error("disk full"); }, {
      isToolError: () => false,
      update: async () => { log.updates += 1; return true; },
      onRetrying: () => {},
    }),
    (e: any) => e[RETRY_SPENT] === undefined,
  );
  assert.equal(log.updates, 0);
});
