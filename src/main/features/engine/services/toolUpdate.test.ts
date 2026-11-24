/**
 * File: toolUpdate.test.ts
 * Path: src/main/features/engine/services/toolUpdate.test.ts
 * Description: yt-dlp self-update: only when a newer release exists, only a binary that runs is installed,
 *   failures are results. Fake network and process; not verified against real GitHub or YouTube.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newestToolFile, singleFlight, updateYtDlp, versionOfToolFile, ytDlpDownloadUrl, type ToolUpdateDeps } from "./toolUpdate";

function deps(over: Partial<ToolUpdateDeps> & { latest?: string; current?: string | null; runs?: boolean } = {}) {
  const calls: string[] = [];
  const d: ToolUpdateDeps = {
    platform: "linux",
    currentVersion: () => (over.current === undefined ? "2026.10.01" : over.current),
    fetchLatestTag: async () => over.latest ?? "2026.11.23",
    download: async (url, dest) => void calls.push(`download ${url} -> ${dest}`),
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
