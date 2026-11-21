/**
 * t4-e2-mechanisms.ts — E-2's two protections, each tested with the other
 * defeated.
 *
 * The claim in audit/run-1/fixes/T7.md is redundancy: the live checkpoint is
 * kept away from "Clear unfinished" by BOTH a prefix the sweep does not match
 * (`ytchanwip-`) AND an in-use hold (`markInUse`), "either alone keeps Clear
 * away". That is only worth something if each one works with the other gone.
 *
 * Nothing here is reimplemented: the real `clearCache`, `cacheUsage`,
 * `markInUse` and `isProtected` from server/resumeCache.ts are called. The one
 * piece of scaffolding is that `os.tmpdir()` is pointed at a scratch directory
 * BEFORE the module is loaded, because clearCache() is global over the real
 * temp dir and other audit areas have work folders there. The code under test
 * is unchanged.
 *
 * run: node_modules/.bin/tsx audit/run-2/area-E/t4-e2-mechanisms.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REAL_TMP = os.tmpdir();
const SCRATCH = fs.mkdtempSync(path.join(REAL_TMP, "r2e-t4-"));
// Scope the product's global sweep to a scratch dir. resumeCache.ts calls
// os.tmpdir() inside each function, so this is honoured for every call.
(os as unknown as { tmpdir: () => string }).tmpdir = () => SCRATCH;

const rc = await import("../../../server/resumeCache");

const CHECKPOINT_PREFIX = "ytchanwip-"; // channelRoutes.ts
const SWEPT_PREFIX = rc.EXPORT_PREFIX; // "ytchan-", what Clear sweeps

function mk(name: string, bytes = 100): string {
  const dir = path.join(SCRATCH, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "comments.jsonl"), "x".repeat(bytes));
  return dir;
}
const alive = (d: string) => fs.existsSync(path.join(d, "comments.jsonl"));

const out: Record<string, unknown> = { scratch: SCRATCH, sweptPrefix: SWEPT_PREFIX, checkpointPrefix: CHECKPOINT_PREFIX };

// ---------------------------------------------------------------------------
// 1. Control: does the probe discriminate at all? An abandoned folder with the
//    swept prefix and no hold MUST be removed, or nothing below means anything.
// ---------------------------------------------------------------------------
{
  const abandoned = mk(`${SWEPT_PREFIX}abandoned1`);
  const usageBefore = rc.cacheUsage();
  const res = rc.clearCache();
  out.control_abandoned = {
    usageBefore,
    clear: res,
    survived: alive(abandoned),
    expect: "survived === false",
    pass: alive(abandoned) === false,
  };
}

// ---------------------------------------------------------------------------
// 2. Prefix DEFEATED, markInUse alone. The live folder is given the prefix
//    Clear does sweep, and held with markInUse().
// ---------------------------------------------------------------------------
{
  const live = mk(`${SWEPT_PREFIX}live-held`, 1000);
  const abandoned = mk(`${SWEPT_PREFIX}abandoned2`);
  const release = rc.markInUse(live);
  const usage = rc.cacheUsage();
  const protectedNow = rc.isProtected(live);
  const res = rc.clearCache();
  const survived = alive(live);
  release();
  const afterRelease = rc.clearCache();
  out.markInUse_alone = {
    usageWhileHeld: usage,
    isProtected: protectedNow,
    clear: res,
    liveSurvived: survived,
    abandonedRemoved: alive(abandoned) === false,
    removedOnceReleased: afterRelease.removed >= 1 && alive(live) === false,
    expect: "liveSurvived === true while held, removed after release",
    pass: survived === true && alive(abandoned) === false,
  };
}

// ---------------------------------------------------------------------------
// 3. markInUse DEFEATED, prefix alone. The live folder uses the exporter's real
//    checkpoint prefix and is NOT held.
// ---------------------------------------------------------------------------
{
  const live = mk(`${CHECKPOINT_PREFIX}live-unheld`, 1000);
  const abandoned = mk(`${SWEPT_PREFIX}abandoned3`);
  const usage = rc.cacheUsage();
  const protectedNow = rc.isProtected(live);
  const res = rc.clearCache();
  out.prefix_alone = {
    usage,
    isProtected: protectedNow,
    clear: res,
    liveSurvived: alive(live),
    abandonedRemoved: alive(abandoned) === false,
    expect: "liveSurvived === true, and the folder is NOT counted as reclaimable",
    pass: alive(live) === true && alive(abandoned) === false,
    countedAsReclaimable: usage.folders > 1,
  };
}

// ---------------------------------------------------------------------------
// 4. Both defeated: the swept prefix and no hold. Must be destroyed — this is
//    the case the strict appendCheckpoint in channelRoutes.ts has to catch, and
//    t5 drives it in the running app.
// ---------------------------------------------------------------------------
{
  const live = mk(`${SWEPT_PREFIX}live-naked`, 1000);
  const res = rc.clearCache();
  out.both_defeated = { clear: res, liveSurvived: alive(live), expect: "liveSurvived === false", pass: alive(live) === false };
}

// ---------------------------------------------------------------------------
// 5. The stale sweep. channelRoutes.ts has its OWN 7-day sweep for
//    ytchanwip-, because resumeCache no longer sees the prefix. Check that
//    resumeCache's own stale sweep indeed does not touch it (so the only thing
//    that ever cleans a ytchanwip- folder is the exporter's sweep, which runs
//    on registerChannelRoutes — i.e. never in a public build).
// ---------------------------------------------------------------------------
{
  const old = mk(`${CHECKPOINT_PREFIX}eight-days-old`, 500);
  const oldSwept = mk(`${SWEPT_PREFIX}eight-days-old`, 500);
  const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(old, past, past);
  fs.utimesSync(oldSwept, past, past);
  const removed = rc.sweepStaleCache();
  out.stale_sweep = {
    removed,
    wipSurvived: alive(old),
    sweptPrefixRemoved: alive(oldSwept) === false,
    note: "a ytchanwip- folder is invisible to resumeCache's stale sweep by design",
  };
}

// ---------------------------------------------------------------------------
// 6. Is the exporter's output folder (ytchan-, from mkdtemp in buildResponse)
//    protected between the export's response and export:save moving it?
// ---------------------------------------------------------------------------
{
  const outDir = mk(`${SWEPT_PREFIX}finished-csvs`, 2000);
  const usage = rc.cacheUsage();
  const res = rc.clearCache();
  out.finished_output_folder = {
    usage,
    clear: res,
    survived: alive(outDir),
    note: "clip:save holds its folder with holdFolder(); the channel exporter's CSV output folder is not held",
  };
}

fs.mkdirSync(path.join(import.meta.dirname, "out"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, "out", "t4-e2-mechanisms.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
fs.rmSync(SCRATCH, { recursive: true, force: true });
