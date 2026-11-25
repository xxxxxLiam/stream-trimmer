/**
 * File: toolUpdate.test.ts
 * Path: src/main/features/engine/services/toolUpdate.test.ts
 * Description: yt-dlp self-update: only when a newer release exists, only a binary that runs is installed,
 *   failures are results. Fake network and process; not verified against real GitHub or YouTube.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checksumFor, newestToolFile, singleFlight, updateYtDlp, versionOfToolFile, ytDlpDownloadUrl, type ToolUpdateDeps } from "./toolUpdate";

const SUM = "a".repeat(64);

function deps(over: Partial<ToolUpdateDeps> & { latest?: string; current?: string | null; runs?: boolean; sum?: string } = {}) {
  const calls: string[] = [];
  const d: ToolUpdateDeps = {
    platform: "linux",
    currentVersion: () => (over.current === undefined ? "2026.10.01" : over.current),
    fetchLatestTag: async () => over.latest ?? "2026.11.23",
    download: async (url, dest) => void calls.push(`download ${url} -> ${dest}`),
    fetchChecksums: async () => `${SUM}  yt-dlp_linux\n${SUM}  yt-dlp.exe\n${SUM}  yt-dlp_macos\n`,
    checksumOf: async () => over.sum ?? SUM,
    verify: async () => (over.runs === false ? null : "2026.11.23"),
    install: async (tmp, name) => void calls.push(`install ${name}`),
    tmpPathFor: (n) => `/tools/${n}`,
    onUpdating: () => calls.push("updating"),
    onInstalled: () => calls.push("installed"),
    ...over,
  };
  return { d, calls };
}

test("a newer release is downloaded, verified, installed, then announced", async () => {
  const { d, calls } = deps();
  assert.deepEqual(await updateYtDlp(d), { updated: true, from: "2026.10.01", to: "2026.11.23" });
  assert.deepEqual(calls, [
    "updating",
    "download https://github.com/yt-dlp/yt-dlp/releases/download/2026.11.23/yt-dlp_linux -> /tools/yt-dlp-2026.11.23.download",
    "install yt-dlp-2026.11.23",
    "installed",
  ]);
});

test("nothing newer: nothing is downloaded", async () => {
  const { d, calls } = deps({ latest: "2026.10.01" });
  assert.deepEqual(await updateYtDlp(d), { updated: false, why: "current" });
  assert.deepEqual(calls, []);
});

test("a binary that will not run is never installed", async () => {
  const { d, calls } = deps({ runs: false });
  const res = await updateYtDlp(d);
  assert.equal(res.updated, false);
  assert.ok(!calls.includes("install yt-dlp-2026.11.23"));
});

test("a network failure is a result, not a throw", async () => {
  const { d } = deps({ fetchLatestTag: async () => { throw new Error("offline"); } });
  assert.deepEqual(await updateYtDlp(d), { updated: false, why: "failed", error: "offline" });
});

test("windows file names and urls", async () => {
  assert.equal(ytDlpDownloadUrl("win32", "2026.11.23"), "https://github.com/yt-dlp/yt-dlp/releases/download/2026.11.23/yt-dlp.exe");
  const { d, calls } = deps({ platform: "win32" });
  await updateYtDlp(d);
  assert.ok(calls.includes("install yt-dlp-2026.11.23.exe"));
});

test("the newest updated binary wins, and stray files are ignored", () => {
  assert.equal(versionOfToolFile("yt-dlp-2026.11.23.exe"), "2026.11.23");
  assert.equal(versionOfToolFile("yt-dlp-2026.11.23.download"), null);
  assert.deepEqual(newestToolFile(["yt-dlp-2026.09.01", "yt-dlp-2026.11.23.1", "yt-dlp-2026.11.23", "notes.txt"]), { name: "yt-dlp-2026.11.23.1", version: "2026.11.23.1" });
  assert.equal(newestToolFile([]), null);
});

test("callers that arrive during an update share it", async () => {
  let runs = 0;
  const once = singleFlight(async () => { runs += 1; await new Promise((r) => setTimeout(r, 5)); return runs; });
  assert.deepEqual(await Promise.all([once(), once()]), [1, 1]);
  assert.equal(await once(), 2);
});

// ---- E-11: a checksum before anything runs, and a tag that is exactly a date --------------------

test("a download that does not match the release's checksum is refused and never run", async () => {
  let ran = false;
  const { d, calls } = deps({ sum: "c".repeat(64), verify: async () => ((ran = true), "2026.11.23") });
  const r = await updateYtDlp(d);
  assert.equal(r.updated, false);
  assert.match(String((r as { error?: string }).error), /checksum/);
  assert.equal(ran, false);
  assert.ok(!calls.some((c) => c.startsWith("install")));
});

test("a release with no checksum for this platform's file installs nothing", async () => {
  const { d, calls } = deps({ fetchChecksums: async () => `${"a".repeat(64)}  something-else\n` });
  const r = await updateYtDlp(d);
  assert.equal(r.updated, false);
  assert.ok(!calls.some((c) => c.startsWith("install")));
});

test("checksum lines are read with or without the binary-mode star", () => {
  const sums = `${"a".repeat(64)} *yt-dlp.exe\n${"b".repeat(64)}  yt-dlp_linux\n`;
  assert.equal(checksumFor(sums, "yt-dlp.exe"), "a".repeat(64));
  assert.equal(checksumFor(sums, "yt-dlp_linux"), "b".repeat(64));
  assert.equal(checksumFor(sums, "yt-dlp"), null);
});

test("a tag with anything after the date (a path, a suffix) is refused before any download", async () => {
  for (const latest of ["2026.11.23/../../../evil", "2026.11.23-evil", "x2026.11.23", "2026.11.23.1/x"]) {
    const { d, calls } = deps({ latest });
    const r = await updateYtDlp(d);
    assert.equal(r.updated, false, latest);
    assert.ok(!calls.some((c) => c.startsWith("download")), latest);
  }
  const ok = deps({ latest: "2026.11.23.1" });
  assert.equal((await updateYtDlp(ok.d)).updated, true);
});
