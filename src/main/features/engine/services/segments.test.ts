/**
 * File: segments.test.ts
 * Path: src/main/features/engine/services/segments.test.ts
 * Description: A clip is a list of ranges joined into one file. Pins the pure
 * pieces (request shape, the yt-dlp section string, the concat list and its
 * copy-versus-re-encode decision, the failure table) and then drives the real
 * route against the fake yt-dlp / ffmpeg to show what a user would see: one
 * file out of several segments, the named stages in order, no temp left
 * behind, the saved sign-in never shared between runs, and a 360p result that
 * never passes without its cause.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DURATION_TOLERANCE_SEC,
  MAX_SEGMENTS,
  buildConcatList,
  classifyFailure,
  concatCopyArgs,
  concatReencodeArgs,
  durationMatches,
  joinSegments,
  lowQualityWithoutSession,
  outPointFailure,
  parseDurationSec,
  pruneWorkDir,
  resolveSegments,
  sectionArg,
  segmentFileName,
  segmentWindow,
  segmentsTotal,
  stageDownloaded,
  stageJoining,
  staleSessionFailure,
  type JoinDeps,
} from "./segments";
import { startHarness, type Harness } from "../testSupport/exportHarness";
import { acquireCookiePath } from "./cookieJar";
import { CLIP_PREFIX, clearCache } from "./resumeCache";

// --- the request ----------------------------------------------------------

test("a lone start/end is one segment, so existing callers keep working", () => {
  const r = resolveSegments({ start: 5, end: 12 }, 600);
  assert.deepEqual(r, { ok: true, segments: [{ start: 5, end: 12 }] });
});

test("segments keep the order they were given in", () => {
  // Order is the user's: the join is in the order marked, not in time order.
  const r = resolveSegments(
    { segments: [{ start: 600, end: 660 }, { start: 60, end: 120 }] },
    600,
  );
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.segments.map((s) => s.start), [600, 60]);
  assert.equal(segmentsTotal((r as any).segments), 120);
});

test("a bad segment is refused with the message the single range always gave", () => {
  assert.deepEqual(resolveSegments({ start: 9, end: 9 }, 600), {
    ok: false,
    error: "End must be greater than start",
  });
  const bad = resolveSegments(
    { segments: [{ start: 1, end: 5 }, { start: 8, end: 3 }] },
    600,
  );
  assert.equal(bad.ok, false);
  assert.equal(resolveSegments({}, 600).ok, false);
});

test("the length cap applies to the stitched total, not to each piece", () => {
  const r = resolveSegments(
    { segments: [{ start: 0, end: 400 }, { start: 1000, end: 1400 }] },
    600,
  );
  assert.equal(r.ok, false);
  const many = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => ({
    start: i * 10,
    end: i * 10 + 1,
  }));
  assert.equal(resolveSegments({ segments: many }, 600).ok, false);
});

test("the section string is what yt-dlp's --download-sections expects", () => {
  assert.equal(sectionArg({ start: 60, end: 120 }), "*60.00-120.00");
  assert.equal(sectionArg({ start: 1.5, end: 2.25 }), "*1.50-2.25");
  assert.equal(segmentFileName(0, "mp4"), "seg-01.mp4");
  assert.equal(segmentFileName(11, "mp3"), "seg-12.mp3");
});

test("segments share the first 90% of the bar, one segment keeps all of it", () => {
  assert.deepEqual(segmentWindow(0, 1), { from: 0, to: 99 });
  assert.deepEqual(segmentWindow(0, 3), { from: 0, to: 30 });
  assert.deepEqual(segmentWindow(2, 3), { from: 60, to: 90 });
});

// --- joining --------------------------------------------------------------

test("the concat list quotes every path and survives an apostrophe", () => {
  assert.equal(
    buildConcatList(["/t/seg-01.mp4", "/t/it's/seg-02.mp4"]),
    "file '/t/seg-01.mp4'\nfile '/t/it'\\''s/seg-02.mp4'\n",
  );
});

test("the join commands are the ones the design specifies", () => {
  const copy = concatCopyArgs("l.txt", "o.mp4", { isAudio: false }).join(" ");
  assert.match(copy, /-f concat -safe 0 -i l\.txt -c copy/);
  const enc = concatReencodeArgs("l.txt", "o.mp4", { isAudio: false }).join(" ");
  assert.match(
    enc,
    /-c:v libx264 -crf 18 -preset veryfast -c:a aac -b:a 192k/,
  );
});

test("durations read out of ffmpeg's banner and compare within half a second", () => {
  assert.equal(parseDurationSec("  Duration: 00:01:30.50, start: 0"), 90.5);
  assert.equal(parseDurationSec("no banner"), undefined);
  assert.equal(DURATION_TOLERANCE_SEC, 0.5);
  assert.ok(durationMatches(100.5, 100));
  assert.ok(!durationMatches(100.51, 100));
  assert.ok(!durationMatches(undefined, 100));
});

function joinHarness(opts: {
  copyCode?: number;
  copyDuration?: number;
  encodeCode?: number;
  encodeDuration?: number;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seg-join-"));
  const calls: string[] = [];
  const logs: string[] = [];
  let lastKind = "";
  const deps: JoinDeps = {
    async run(args) {
      const enc = args.includes("libx264");
      lastKind = enc ? "encode" : "copy";
      calls.push(lastKind);
      const code = enc ? (opts.encodeCode ?? 0) : (opts.copyCode ?? 0);
      if (code === 0) fs.writeFileSync(args[args.length - 1], "x");
      return { code, stderr: code === 0 ? "" : "boom" };
    },
    probeDuration: () =>
      lastKind === "encode" ? (opts.encodeDuration ?? 90) : opts.copyDuration,
    log: (m) => logs.push(m),
  };
  return { dir, calls, logs, deps };
}

test("a good stream copy is kept and nothing is re-encoded", async () => {
  const h = joinHarness({ copyDuration: 90.2 });
  const r = await joinSegments(["a", "b"], path.join(h.dir, "o.mp4"), path.join(h.dir, "l.txt"), 90, { isAudio: false }, h.deps);
  assert.equal(r.method, "copy");
  assert.deepEqual(h.calls, ["copy"]);
  assert.match(h.logs.join("\n"), /stream copy ok/);
  fs.rmSync(h.dir, { recursive: true, force: true });
});

test("a copy that fails falls back to a re-encode, and the log says so", async () => {
  const h = joinHarness({ copyCode: 1 });
  const r = await joinSegments(["a", "b"], path.join(h.dir, "o.mp4"), path.join(h.dir, "l.txt"), 90, { isAudio: false }, h.deps);
  assert.equal(r.method, "reencode");
  assert.deepEqual(h.calls, ["copy", "encode"]);
  assert.match(h.logs.join("\n"), /re-encoding/);
  fs.rmSync(h.dir, { recursive: true, force: true });
});

test("a copy of the wrong length is not trusted", async () => {
  const h = joinHarness({ copyDuration: 93 });
  const r = await joinSegments(["a", "b"], path.join(h.dir, "o.mp4"), path.join(h.dir, "l.txt"), 90, { isAudio: false }, h.deps);
  assert.equal(r.method, "reencode");
  assert.match(String(r.reason), /93\.00s, expected 90\.00s/);
  fs.rmSync(h.dir, { recursive: true, force: true });
});

test("a copy whose length cannot be read is re-encoded rather than guessed at", async () => {
  const h = joinHarness({ copyDuration: undefined });
  const r = await joinSegments(["a", "b"], path.join(h.dir, "o.mp4"), path.join(h.dir, "l.txt"), 90, { isAudio: false }, h.deps);
  assert.equal(r.method, "reencode");
  fs.rmSync(h.dir, { recursive: true, force: true });
});

test("when the re-encode fails too, the join fails loudly", async () => {
  const h = joinHarness({ copyCode: 1, encodeCode: 1 });
  await assert.rejects(
    joinSegments(["a", "b"], path.join(h.dir, "o.mp4"), path.join(h.dir, "l.txt"), 90, { isAudio: false }, h.deps),
    (e: any) => e.joinFailed === true,
  );
  fs.rmSync(h.dir, { recursive: true, force: true });
});

// --- temp cleanup ---------------------------------------------------------

test("pruning keeps what a retry resumes from and drops the rest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seg-prune-"));
  for (const f of [
    "seg-01.mp4.part",
    "clip.mp4.ytdl",
    "source.mp4",
    "seg-01.mp4",
    "list.txt",
    "clip.mp4",
  ]) {
    fs.writeFileSync(path.join(dir, f), "x");
  }
  pruneWorkDir(dir);
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    "clip.mp4.ytdl",
    "seg-01.mp4.part",
    "source.mp4",
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- failures: cause, the one fix, the work kept -----------------------------

const CASES: Array<[string, string, string, RegExp?]> = [
  ["ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "private_video", "import_cookies"],
  ["ERROR: This video is only available to this channel's members-only", "private_video", "import_cookies"],
  ["ERROR: unable to write data: [Errno 28] No space left on device", "disk_full", "choose_other_folder"],
  ["OSError: [Errno 2] No such file or directory: '/Volumes/Drive/clips'", "save_folder_gone", "choose_folder"],
  ["ERROR: Connection reset by peer", "network_dropped", "resume", /Resume from 0%/],
  ["ERROR: Unable to extract nsig function", "engine_behind", "update_engine"],
];

for (const [text, code, action, label] of CASES) {
  test(`failure row: ${code}`, () => {
    const f = classifyFailure(text);
    assert.equal(f.code, code);
    assert.equal(f.action.id, action);
    // The table shape: a cause, one action, and what was kept. Never empty.
    assert.ok(f.cause.length > 20, f.cause);
    assert.ok(f.action.label.length > 0);
    assert.match(f.preserved, /kept|on disk/);
    assert.equal(f.error, `${f.cause}. ${f.action.label}. ${f.preserved}`.replace(/\.\./g, "."));
    // House style: no em dash in anything the app produces.
    assert.doesNotMatch(f.error, /\u2014/);
    if (label) assert.match(f.action.label, label);
  });
}

test("a dropped connection says where it stopped and offers to resume from there", () => {
  const f = classifyFailure("ERROR: Connection reset by peer", {
    percent: 47,
    partialBytes: 12 * 1024 * 1024,
  });
  assert.equal(f.action.label, "Resume from 47%");
  assert.match(f.cause, /47%/);
  assert.match(f.preserved, /12\.0 MB already fetched is on disk/);
});

test("a full disk says how much was needed and how much is free", () => {
  const f = classifyFailure("No space left on device", { neededMb: 480, freeMb: 90 });
  assert.match(f.cause, /about 480 MB and 90 MB is free/);
});

test("a missing yt-dlp binary is not mistaken for a missing save folder", () => {
  const f = classifyFailure("spawn /opt/yt-dlp ENOENT");
  assert.notEqual(f.code, "save_folder_gone");
});

test("an unrecognised failure still comes out in the table shape", () => {
  const f = classifyFailure("ERROR: something nobody has seen");
  assert.equal(f.code, "unknown");
  assert.match(f.cause, /something nobody has seen/);
  assert.equal(f.action.id, "retry");
  assert.match(f.preserved, /marked range is kept/i);
});

test("an out point past the end says what was asked and where the video ends", () => {
  const f = outPointFailure(3725, 3600);
  assert.equal(f.action.id, "snap_out_point");
  assert.match(f.cause, /01:02:05/);
  assert.match(f.cause, /01:00:00/);
  assert.equal(f.detail?.runsTo, 3600);
});

test("360p without a confirmed session is the stale-session failure", () => {
  const f = staleSessionFailure(200);
  assert.equal(f.code, "stale_session");
  assert.equal(f.action.label, "Re-import cookies.txt");
  assert.match(f.cause, /signed-in requests and the saved session expired/);
});

test("only a low result with no valid session is flagged", () => {
  const base = { deliveredHeight: 360, requested: 1080 as number | "best", sessionValid: false, isAudio: false };
  assert.equal(lowQualityWithoutSession(base), true);
  assert.equal(lowQualityWithoutSession({ ...base, requested: "best" }), true);
  // Asking for 360 and getting 360 is a choice.
  assert.equal(lowQualityWithoutSession({ ...base, requested: 360 }), false);
  // A confirmed session that still gave 360p is some other problem.
  assert.equal(lowQualityWithoutSession({ ...base, sessionValid: true }), false);
  assert.equal(lowQualityWithoutSession({ ...base, deliveredHeight: 720 }), false);
  assert.equal(lowQualityWithoutSession({ ...base, isAudio: true }), false);
  assert.equal(lowQualityWithoutSession({ ...base, deliveredHeight: undefined }), false);
});

// --- the real route, against the fake yt-dlp and ffmpeg ---------------------

const cookieDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-segtest-"));
const cookieFile = path.join(cookieDir, "yt-cookies.txt");
const KNOWN_GOOD_JAR =
  "# Netscape HTTP Cookie File\n" +
  ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tknown-good-sid\n" +
  ".youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tknown-good-3psid\n";
fs.writeFileSync(cookieFile, KNOWN_GOOD_JAR);
process.env.YT_CLIPPER_COOKIE_FILE = cookieFile;
test.after(() => fs.rmSync(cookieDir, { recursive: true, force: true }));

const PROBED = [1080, 720, 360];
const URL_ = "https://www.youtube.com/watch?v=lf000001";

/** Starts a harness with the given fake-binary knobs in its environment. */
async function harnessWith(
  env: Record<string, string>,
  channel: Parameters<typeof startHarness>[0] = {
    availableHeights: PROBED,
    deliveredHeights: { primary: 1080, fallback: 1080 },
  },
): Promise<{ harness: Harness; ffmpegCalls: () => string[]; stop: () => Promise<void> }> {
  const ffLog = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "seg-ffl-")),
    "ffmpeg.log",
  );
  const saved: Record<string, string | undefined> = {};
  const all = { FAKE_FFMPEG_LOG: ffLog, ...env };
  for (const [k, v] of Object.entries(all)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    const harness = await startHarness(channel);
    return {
      harness,
      ffmpegCalls: () => {
        try {
          return fs.readFileSync(ffLog, "utf8").split("\n").filter(Boolean);
        } catch {
          return [];
        }
      },
      stop: async () => {
        await harness.stop();
        fs.rmSync(path.dirname(ffLog), { recursive: true, force: true });
      },
    };
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

interface CutResult {
  status: number;
  headers: Headers;
  body: any;
  stages: string[];
}

async function cut(
  harness: Harness,
  body: Record<string, unknown>,
): Promise<CutResult> {
  const jobId = `seg_${Math.random().toString(36).slice(2)}`;
  const ctrl = new AbortController();
  const messages: string[] = [];
  const watcher = fetch(
    `${harness.baseUrl}/api/download/progress?jobId=${jobId}`,
    { signal: ctrl.signal },
  )
    .then(async (r) => {
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buf += dec.decode(value);
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const p of parts) {
          const m = p.match(/^data: (.*)$/m);
          if (!m) continue;
          const evt = JSON.parse(m[1]);
          if (evt.message) messages.push(evt.message);
        }
      }
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 150));

  const res = await fetch(`${harness.baseUrl}/api/download?jobId=${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: URL_,
      format: "mp4",
      quality: "1080",
      deliver: "path",
      cookiesFromBrowser: "app",
      ...body,
    }),
  });
  const json = await res.json();
  await new Promise((r) => setTimeout(r, 200));
  ctrl.abort();
  await watcher;
  // The ordered, de-duplicated named stages.
  const stages: string[] = [];
  for (const m of messages) {
    if (
      /^(Found the stream|Downloaded segment|Joining|Writing to your folder)/.test(m) &&
      stages[stages.length - 1] !== m
    ) {
      stages.push(m);
    }
  }
  return { status: res.status, headers: res.headers, body: json, stages };
}

function execLines(h: Harness): Array<Record<string, any>> {
  return h
    .log()
    .split("\n")
    .filter((l) => l.includes("/api/download exec "))
    .map((l) => JSON.parse(l.replace(/^.*?options=/, "")));
}

/** The server's temp dir for this harness (it sets TMPDIR to it). */
const serverTmp = (h: Harness) => path.join(h.tmpDir, "tmp");
const SEGS = [
  { start: 10, end: 20 },
  { start: 100, end: 105 },
];

test("several segments come out as ONE file, joined by stream copy", async (t) => {
  const { harness, ffmpegCalls, stop } = await harnessWith({});
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("X-Segments"), "2");
  assert.equal(r.headers.get("X-Join-Method"), "copy");

  // One file, and its length is the sum of the segments.
  const media = fs.readFileSync(r.body.path, "utf8");
  assert.match(media, /duration=15 /);
  assert.match(media, /parts=2/);
  assert.equal(path.basename(r.body.path), "clip.mp4");

  // One yt-dlp per segment, each with exactly its own section, and
  // keyframe forcing on (what makes the cut frame-accurate).
  const runs = execLines(harness);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((o) => o.downloadSections), ["*10.00-20.00", "*100.00-105.00"]);
  for (const o of runs) assert.equal(o.forceKeyframesAtCuts, true);

  assert.deepEqual(ffmpegCalls().filter((c) => c.startsWith("concat")), ["concat-copy"]);
  assert.match(harness.log(), /join: stream copy ok/);
});

test("the stages are named, in order, with the segment counts", async (t) => {
  const { harness, stop } = await harnessWith({});
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.stages, [
    "Found the stream",
    stageDownloaded(1, 2),
    stageDownloaded(2, 2),
    stageJoining(2),
    "Writing to your folder",
  ]);
});

test("a copy that comes out the wrong length is re-encoded, and the log says which path ran", async (t) => {
  const { harness, ffmpegCalls, stop } = await harnessWith({ FAKE_CONCAT_SKEW: "3" });
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("X-Join-Method"), "reencode");
  assert.deepEqual(ffmpegCalls().filter((c) => c.startsWith("concat")), ["concat-copy", "concat-reencode"]);
  assert.match(fs.readFileSync(r.body.path, "utf8"), /joined=reencode/);
  assert.match(harness.log(), /join: stream copy rejected .*re-encoding/);
});

test("a stream copy that fails outright is re-encoded", async (t) => {
  const { harness, stop } = await harnessWith({ FAKE_CONCAT_COPY_FAIL: "1" });
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("X-Join-Method"), "reencode");
  assert.match(harness.log(), /ffmpeg -c copy exited 1/);
});

test("ONE segment takes today's single-range path with no concat", async (t) => {
  const { harness, ffmpegCalls, stop } = await harnessWith({});
  t.after(stop);

  // Both shapes of the same request.
  let r0Path = "";
  for (const body of [{ start: 10, end: 20 }, { segments: [{ start: 10, end: 20 }] }]) {
    const r = await cut(harness, body);
    r0Path = r.body.path;
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.headers.get("X-Join-Method"), null);
    assert.equal(r.body.segments, 1);
    assert.ok(!r.stages.some((s) => s.startsWith("Joining")), r.stages.join());
    assert.match(fs.readFileSync(r.body.path, "utf8"), /duration=10\n/);
  }
  assert.equal(ffmpegCalls().filter((c) => c.startsWith("concat")).length, 0);
  // G2-1: even a lone range is written into the resumable folder (so a dropped
  // download's `.part` survives the failed request's cleanup) and moved to
  // clip.mp4 only once it is finished. It never reaches the join.
  const runs = execLines(harness);
  assert.ok(runs.every((o) => String(o.output).endsWith("seg-01.mp4")));
  assert.ok(r0Path && r0Path.endsWith("clip.mp4"));
});

test("no segment file, list or private cookie copy is left behind on success", async (t) => {
  const { harness, stop } = await harnessWith({});
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const dir = path.dirname(r.body.path);
  assert.deepEqual(fs.readdirSync(dir), ["clip.mp4"]);
  const leaked = fs
    .readdirSync(serverTmp(harness))
    .filter((n) => n.startsWith("ytcookie-"));
  assert.deepEqual(leaked, []);
});

test("a failed segment keeps its partial download and leaves nothing else", async (t) => {
  // The second segment's connection drops. The first is finished but is not
  // worth keeping (it is redone), the partial of the second is.
  const { harness, stop } = await harnessWith({
    FAKE_FAIL_AT_START: "100",
    FAKE_FAIL_MESSAGE: "ERROR: Connection reset by peer\n",
  });
  t.after(stop);

  const r = await cut(harness, { segments: SEGS });
  assert.equal(r.status, 502, JSON.stringify(r.body));
  assert.equal(r.body.code, "network_dropped");
  assert.match(r.body.action.label, /^Resume from \d+%$/);
  assert.match(r.body.preserved, /marked range is kept/);

  const work = fs
    .readdirSync(serverTmp(harness))
    .filter((n) => n.startsWith("ytclip-"));
  assert.equal(work.length, 1, work.join());
  const files = fs.readdirSync(path.join(serverTmp(harness), work[0]));
  assert.deepEqual(files, ["seg-02.mp4.part"]);
  assert.deepEqual(
    fs.readdirSync(serverTmp(harness)).filter((n) => n.startsWith("ytcookie-")),
    [],
  );
});

test("an out point past the end is named, with the one fix, and nothing is cut", async (t) => {
  const { harness, stop } = await harnessWith({});
  t.after(stop);

  // The fake video runs 300 seconds.
  const r = await cut(harness, { segments: [{ start: 10, end: 20 }, { start: 290, end: 400 }] });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "out_point_past_end");
  assert.equal(r.body.action.id, "snap_out_point");
  assert.equal(r.body.detail.runsTo, 300);
  assert.equal(execLines(harness).length, 0);
});

test("concurrent segment runs never write the saved sign-in", async (t) => {
  // The fake rewrites whatever file it is handed as --cookies, as yt-dlp does
  // on every run. If any segment were handed the canonical path, the user's
  // jar would be clobbered.
  const { harness, stop } = await harnessWith({ FAKE_CLOBBER_COOKIES: "1" });
  t.after(stop);

  const three = [...SEGS, { start: 200, end: 210 }];
  const r = await cut(harness, { segments: three });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const paths = execLines(harness).map((o) => String(o.cookies));
  assert.equal(paths.length, 3);
  for (const p of paths) assert.notEqual(p, cookieFile, "a run was given the canonical jar");
  assert.equal(new Set(paths).size, 3, "runs shared a cookie file");
  assert.equal(fs.readFileSync(cookieFile, "utf8"), KNOWN_GOOD_JAR);
});

test("a 360p result with no confirmed session never passes silently", async (t) => {
  // YouTube lists only 360p (the stale-session signature) and 360p arrives.
  const { harness, stop } = await harnessWith(
    {},
    { availableHeights: [360], deliveredHeights: { primary: 360, fallback: 360 } },
  );
  t.after(stop);

  const r = await cut(harness, { start: 10, end: 20, quality: "best" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("X-Delivered-Height"), "360");
  assert.equal(r.headers.get("X-Quality-Cause"), "stale_session");
  assert.equal(r.headers.get("X-Quality-Action"), "reimport_cookies");
  assert.equal(r.body.warning.code, "stale_session");
  assert.equal(r.body.warning.action.label, "Re-import cookies.txt");
  assert.match(r.body.warning.cause, /saved session expired/);
  assert.match(r.body.warning.preserved, /clip is kept/);
  assert.match(harness.log(), /low quality without a session/);
});

test("asking for 360p and getting 360p is not a warning", async (t) => {
  const { harness, stop } = await harnessWith(
    {},
    { availableHeights: [360], deliveredHeights: { primary: 360, fallback: 360 } },
  );
  t.after(stop);

  const r = await cut(harness, { start: 10, end: 20, quality: "360" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("X-Quality-Cause"), null);
  assert.equal(r.body.warning, undefined);
});

test("clearing the clip cache never removes a cookie copy a download is using", async () => {
  // A cookie copy used to be named ytclip-cookies-*, which clearCache() and the
  // stale sweep treated as a clip work folder, so it could be deleted mid-download.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ytcookie-root-"));
  const canonical = path.join(root, "yt-cookies.txt");
  fs.writeFileSync(canonical, "# Netscape HTTP Cookie File\n");
  const prevTmp = process.env.TMPDIR;
  const tmp = path.join(root, "tmp");
  fs.mkdirSync(tmp);
  process.env.TMPDIR = tmp;
  let lease: Awaited<ReturnType<typeof acquireCookiePath>> | null = null;
  try {
    lease = await acquireCookiePath({ canonicalPath: canonical, tmpRoot: tmp, refresher: false });
    const work = path.join(tmp, `${CLIP_PREFIX}abc123`);
    fs.mkdirSync(work);
    assert.ok(!path.basename(path.dirname(lease.path)).startsWith(CLIP_PREFIX));

    const { removed } = clearCache();
    assert.equal(removed, 1, "only the clip work folder is removed");
    assert.ok(fs.existsSync(lease.path), "the live cookie copy survives");
    assert.ok(!fs.existsSync(work));
  } finally {
    await lease?.release(false);
    if (prevTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prevTmp;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- E-9: real yt-dlp strings that used to fall into "unknown / Try again" ----------------------

test("real yt-dlp errors each get their own row, and a 403 is the refused row, not a dropped connection", () => {
  const code = (m: string) => classifyFailure(m, { percent: 0 });
  assert.equal(code("ERROR: [youtube] a: Sign in to confirm you're not a bot.").code, "bot_check");
  assert.equal(code("ERROR: [youtube] a: Sign in to confirm you’re not a bot.").code, "bot_check");
  assert.equal(code("ERROR: [youtube] a: Sign in to confirm your age.").code, "sign_in_needed");
  assert.equal(code("ERROR: [youtube] a: Video unavailable. This video is not available").code, "video_removed");
  assert.equal(code("ERROR: [youtube] a: The uploader has not made this video available in your country").code, "video_unavailable");
  assert.equal(code("ERROR: [youtube] a: This live event will begin in 2 hours.").code, "video_unavailable");
  const f403 = code("ERROR: unable to download video data: HTTP Error 403: Forbidden");
  assert.notEqual(f403.code, "network_dropped");
  assert.match(f403.error, /refused/);
  assert.equal(f403.code, "access_refused");
  assert.equal(code("WARNING: [youtube] HTTP Error 429: Too Many Requests").code, "rate_limited");
  assert.match(code("ERROR: Postprocessing: ffprobe and ffmpeg not found.").error, /video tools are incomplete/);
  assert.equal(code("ERROR: Postprocessing: ffprobe and ffmpeg not found.").code, "tools_missing");
  assert.equal(code("ERROR: [youtube] a: Requested format is not available. Use --list-formats").code, "format_unavailable");
  const perm = code("ERROR: unable to open for writing: [Errno 13] Permission denied: '/Users/x/Clips/a.mp4'");
  assert.equal(perm.code, "folder_not_writable");
  assert.equal(code("ERROR: [Errno 30] Read-only file system: '/Volumes/Disk/a.mp4'").code, "folder_not_writable");
  assert.match(perm.error, /can't write to that folder/);
  // Members-only and private still go to the private row.
  assert.equal(code("Private video. Sign in if you've been granted access").code, "private_video");
});

test("E2-1 / E-9: each cause has its own code and sentence, and none of them promises a tool update", () => {
  const cases: [string, string, RegExp][] = [
    ["ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader", "video_removed", /removed/],
    ["ERROR: [youtube] x: Sign in to confirm you're not a bot. Use --cookies-from-browser", "bot_check", /prove it isn't a bot/],
    ["ERROR: unable to download video data: HTTP Error 403: Forbidden", "access_refused", /refused/],
    ["ERROR: unable to download video data: HTTP Error 429: Too Many Requests", "rate_limited", /limiting requests/],
    ["ERROR: [youtube] x: Requested format is not available", "format_unavailable", /no version of this video/],
    ["ERROR: Postprocessing: ffprobe and ffmpeg not found.", "tools_missing", /tools are incomplete/],
  ];
  const seen = new Set<string>();
  for (const [text, code, re] of cases) {
    const f = classifyFailure(text, { percent: 0 });
    assert.equal(f.code, code, text);
    assert.match(f.cause, re);
    assert.doesNotMatch(f.error, /updating|download tools and will try/i);
    seen.add(f.code);
  }
  assert.equal(seen.size, cases.length, "no two causes share a code");
});

test("a folder that is there but refuses the write is folder_not_writable; a missing one stays save_folder_gone", () => {
  for (const t of [
    "PermissionError: [Errno 13] Permission denied: '/Users/x/Clips/a.mp4'",
    "OSError: [Errno 1] Operation not permitted (EPERM)",
    "OSError: [Errno 30] Read-only file system: '/Volumes/Disk/a.mp4'",
    "EROFS: read-only file system, open '/Volumes/Disk/a.mp4'",
  ]) {
    const f = classifyFailure(t);
    assert.equal(f.code, "folder_not_writable", t);
    assert.equal(f.action.id, "choose_folder");
  }
  assert.equal(classifyFailure("OSError: [Errno 2] No such file or directory: '/Volumes/Drive/clips'").code, "save_folder_gone");
});

test("Saad: 'Requested format is not available' with no JavaScript runtime is the missing part, not a quality to change", () => {
  const raw = "ERROR: [youtube] dg7ZH4-UJag: Requested format is not available. Use --list-formats for a list of available formats";
  const missing = classifyFailure(raw, { jsRuntimeMissing: true });
  assert.equal(missing.code, "tools_missing");
  assert.match(missing.error, /part of Clipr that YouTube needs is missing/i);
  assert.equal(missing.action.label, "Reinstall Clipr");
  // With the runtime in place the same words still mean "pick another quality".
  assert.equal(classifyFailure(raw, { jsRuntimeMissing: false }).code, "format_unavailable");
  assert.equal(classifyFailure(raw).code, "format_unavailable");
  // The flag alone changes nothing else.
  assert.equal(classifyFailure("ERROR: unable to download video data: HTTP Error 403: Forbidden", { jsRuntimeMissing: true }).code, "access_refused");
});
