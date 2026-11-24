/**
 * File: channelExportIsolation.test.ts
 * Path: src/main/features/engine/services/channelExport/channelExportIsolation.test.ts
 * Description: The exporter's working files and who may run it. Boots the
 * real server against the fake yt-dlp (see testSupport/exportHarness.ts) and
 * checks, on the filesystem, that
 *   E-2  clearing the temp cache mid-export, or losing the live checkpoint any
 *        other way, can never produce a "successful" export with empty CSVs;
 *   E-3  two exports of the same request never share a checkpoint;
 *   E-4  a machine that is not on the owner list gets nothing from the routes.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import {
  scanCsvFile,
  startHarness,
  type FakeChannel,
  type Harness,
} from "../../testSupport/exportHarness";

const SLOW = {
  timeout: 300_000,
  skip:
    process.platform === "win32"
      ? "the fake yt-dlp shim is a POSIX shell script"
      : false,
};

async function withHarness<T>(
  channel: FakeChannel,
  fn: (harness: Harness) => Promise<T>,
): Promise<T> {
  const harness = await startHarness(channel);
  try {
    return await fn(harness);
  } finally {
    await harness.stop();
  }
}

const REQUEST = {
  url: "https://www.youtube.com/@testchannel",
  contentType: "longform",
  limit: "all",
  includeVideoDetails: true,
  includeComments: true,
  includeTranscripts: true,
  deliver: "path",
};

async function post(
  harness: Harness,
  route: string,
  body: unknown,
): Promise<{ status: number; body: any; contentType: string }> {
  const res = await fetch(`${harness.baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return {
    status: res.status,
    body: parsed,
    contentType: res.headers.get("content-type") ?? "",
  };
}

const startExport = (harness: Harness, extra: Record<string, unknown> = {}) =>
  post(
    harness,
    `/api/channel/export?jobId=iso_${crypto.randomUUID()}`,
    { ...REQUEST, ...extra },
  );

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sha(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function csvOf(data: any, name: string): string {
  const f = data.files.find((x: any) => x.name === name);
  assert.ok(f, `${name} missing from the response`);
  return f.path;
}

/** The server's own temp dir for this harness. */
const serverTmp = (h: Harness) => path.join(h.tmpDir, "tmp");

/** Folders in the server's temp dir that hold a live checkpoint. */
function checkpointDirs(h: Harness): string[] {
  return fs
    .readdirSync(serverTmp(h))
    .map((n) => path.join(serverTmp(h), n))
    .filter((d) => fs.existsSync(path.join(d, "selection.json")));
}

/**
 * Waits until an export is demonstrably mid-run: its checkpoint exists and at
 * least one video has been flushed to it. Polling rather than a fixed sleep, so
 * a loaded machine cannot make the test act too early.
 */
async function midRun(h: Harness): Promise<string> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const [dir] = checkpointDirs(h);
    if (dir) {
      try {
        if (fs.readFileSync(path.join(dir, "statuses.jsonl"), "utf8").trim()) return dir;
      } catch {
        /* not created yet */
      }
    }
    if (Date.now() > deadline) throw new Error("export never got going");
    await sleep(50);
  }
}

const CHANNEL: FakeChannel = {
  longform: 6,
  shorts: 0,
  commentsPerVideo: 3,
  transcriptLines: 2,
  env: { FAKE_COMMENT_DELAY_MS: "400" },
};

test("E-2: clearing the cache mid-export does not empty the CSVs", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const running = startExport(harness);
    await midRun(harness);
    const cleared = await post(harness, "/api/cache/clear", {});
    assert.equal(cleared.status, 200);

    const done = await running;
    // The checkpoint no longer shares the cache's prefix, so Clear cannot
    // reach it: the run finishes, and finishes complete.
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const comments = scanCsvFile(csvOf(done.body, "comments.csv")).rows;
    const transcripts = scanCsvFile(csvOf(done.body, "transcripts.csv")).rows;
    assert.equal(comments, 6 * 3, "every comment row survived");
    assert.equal(transcripts, 6 * 2, "every transcript row survived");
    assert.equal(done.body.counts.comments, comments);
  }));

test("E-2: a checkpoint that vanishes mid-run is an error, never an empty success", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const running = startExport(harness);
    const dir = await midRun(harness);
    // Whatever the cause — a cache sweep, antivirus, a user — the live files go.
    fs.rmSync(dir, { recursive: true, force: true });

    const done = await running;
    assert.notEqual(
      done.status,
      200,
      `reported success with ${JSON.stringify(done.body.counts)}`,
    );
    assert.match(String(done.body.error), /checkpoint|working|lost|missing/i);
  }));

test("E-2: only the comments file vanishing is also caught", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const running = startExport(harness);
    const dir = await midRun(harness);
    fs.rmSync(path.join(dir, "comments.jsonl"), { force: true });
    const done = await running;
    assert.notEqual(done.status, 200);
  }));

test("E-2: an uninterrupted export is unchanged (row counts and checksum stable)", SLOW, () =>
  withHarness({ ...CHANNEL, env: {} }, async (harness) => {
    const a = await startExport(harness);
    const b = await startExport(harness);
    assert.equal(a.status, 200);
    assert.equal(scanCsvFile(csvOf(a.body, "comments.csv")).rows, 18);
    assert.equal(scanCsvFile(csvOf(a.body, "transcripts.csv")).rows, 12);
    assert.equal(
      sha(csvOf(a.body, "comments.csv")),
      sha(csvOf(b.body, "comments.csv")),
    );
  }));

test("E-3: two identical exports at once are isolated or refused, never corrupt", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const [a, b] = await Promise.all([
      startExport(harness),
      (async () => {
        await sleep(300);
        return startExport(harness);
      })(),
    ]);
    const ok = [a, b].filter((r) => r.status === 200);
    assert.ok(ok.length >= 1, "at least one export completes");
    for (const r of ok) {
      assert.equal(scanCsvFile(csvOf(r.body, "comments.csv")).rows, 18);
      assert.equal(scanCsvFile(csvOf(r.body, "transcripts.csv")).rows, 12);
      assert.equal(scanCsvFile(csvOf(r.body, "videos.csv")).rows, 6);
    }
    for (const r of [a, b].filter((x) => x.status !== 200)) {
      assert.equal(r.status, 409, "a refusal says so plainly");
      assert.match(String(r.body.error), /already/i);
    }
  }));

test("E-3: a refused duplicate leaves the running export's checkpoint alone", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const first = startExport(harness);
    await midRun(harness);
    const second = await startExport(harness);
    assert.equal(second.status, 409);
    const done = await first;
    assert.equal(done.status, 200);
    assert.equal(scanCsvFile(csvOf(done.body, "comments.csv")).rows, 18);
    // ...and the slot is free again afterwards.
    const third = await startExport(harness);
    assert.equal(third.status, 200);
  }));

test("E-3: different requests still run side by side", SLOW, () =>
  withHarness(CHANNEL, async (harness) => {
    const [a, b] = await Promise.all([
      startExport(harness),
      startExport(harness, { includeTranscripts: false }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(scanCsvFile(csvOf(a.body, "transcripts.csv")).rows, 12);
    assert.equal(scanCsvFile(csvOf(b.body, "comments.csv")).rows, 18);
  }));

// --- E-4 -----------------------------------------------------------------

const require_ = createRequire(import.meta.url);
const { readMachineId, hashMachineId } = require_("../../../../shared/services/machineId.ts");
const SALT = "test-salt-not-a-secret";

test("E-4: a machine off the owner list gets no exporter at all", SLOW, () =>
  withHarness(
    {
      longform: 3,
      shorts: 0,
      env: { VITE_OWNER_MACHINES: "0".repeat(64), VITE_OWNER_SALT: SALT },
    },
    async (harness) => {
      const run = await startExport(harness);
      assert.equal(run.status, 404, JSON.stringify(run.body));
      const cancel = await post(harness, "/api/channel/export/cancel", {
        jobId: "x",
      });
      assert.equal(cancel.status, 404);
      const progress = await fetch(
        `${harness.baseUrl}/api/channel/export/progress?jobId=x`,
      );
      assert.ok(
        !(progress.headers.get("content-type") ?? "").includes("event-stream"),
      );
      await progress.body?.cancel();
      // Nothing was run and nothing was written.
      assert.deepEqual(harness.calls(), {});
      assert.equal(checkpointDirs(harness).length, 0);
      // Indistinguishable from a route that does not exist.
      const never = await post(harness, "/api/channel/no-such-route", {});
      assert.equal(run.status, never.status);
      assert.equal(
        String(run.body).replace("/api/channel/export?jobId=", "").replace(/iso_[0-9a-f-]+/, ""),
        String(never.body).replace("/api/channel/no-such-route", "/api/channel/export"),
      );
    },
  ));

test("E-4: an empty owner list fails closed", SLOW, () =>
  withHarness(
    { longform: 3, shorts: 0, env: { VITE_OWNER_MACHINES: "", VITE_OWNER_SALT: SALT } },
    async (harness) => {
      assert.equal((await startExport(harness)).status, 404);
    },
  ));

test("E-4: the owner's own machine is let through", SLOW, async (t) => {
  const id = await readMachineId();
  if (!id) return t.skip("no machine id readable here");
  const mine = hashMachineId(id, SALT);
  await withHarness(
    {
      longform: 3,
      shorts: 0,
      env: { VITE_OWNER_MACHINES: `${"0".repeat(64)}, ${mine.toUpperCase()}`, VITE_OWNER_SALT: SALT },
    },
    async (harness) => {
      const run = await startExport(harness, { includeComments: false, includeTranscripts: false });
      assert.equal(run.status, 200, JSON.stringify(run.body));
    },
  );
});
