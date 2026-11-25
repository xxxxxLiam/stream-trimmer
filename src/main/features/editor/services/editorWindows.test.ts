/**
 * File: editorWindows.test.ts
 * Path: src/main/features/editor/services/editorWindows.test.ts
 * Description: Pins the Windows editor handoff with a fake registry, file system and spawn, so no
 *   Windows machine is needed: the newest Premiere wins, the registry beats the folders, Final Cut is
 *   hidden, a missing editor is named and the file kept, the editor runs with the file as an argument
 *   and never through a shell, and an editor that can't take a project is opened empty with the file
 *   shown. The install locations are from the handoff plan and are NOT verified on a real machine.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { findWindowsEditor } from "./editorDiscoveryWin";
import * as ed from "./editorOpen";

const PF = "C:\\Program Files";
const env = { ProgramFiles: PF, "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
const fakeFs = (files: string[], dirs: Record<string, string[]> = {}) => ({
  existsSync: (p: string) => files.includes(p),
  readdirSync: (d: string) => {
    if (!(d in dirs)) throw new Error("ENOENT");
    return dirs[d];
  },
  statSync: () => ({ isFile: () => true, isDirectory: () => false }),
});
const noRegistry = () => null;

const PREMIERE_24 = `${PF}\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe`;
const PREMIERE_25 = `${PF}\\Adobe\\Adobe Premiere Pro 2025\\Adobe Premiere Pro.exe`;
const RESOLVE = `${PF}\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe`;
const CAPCUT = "C:\\Users\\me\\AppData\\Local\\CapCut\\Apps\\CapCut.exe";
const installed = fakeFs([PREMIERE_24, PREMIERE_25, RESOLVE, CAPCUT, "C:\\clips\\a.mp4"], {
  [`${PF}\\Adobe`]: ["Adobe Premiere Pro 2024", "Adobe Premiere Pro 2025", "Adobe Bridge 2025"],
});
const deps = { fsImpl: installed, env, readRegistry: noRegistry };

test("discovery picks the newest Premiere year, and finds Resolve and CapCut", () => {
  assert.equal(findWindowsEditor("premiere", deps), PREMIERE_25);
  assert.equal(findWindowsEditor("resolve", deps), RESOLVE);
  assert.equal(findWindowsEditor("capcut", deps), CAPCUT);
});

test("the registry App Paths entry wins over the folders, quotes and all", () => {
  const custom = "D:\\Tools\\Resolve\\Resolve.exe";
  const fsImpl = fakeFs([custom, RESOLVE]);
  const readRegistry = (k: string) => (k.endsWith("App Paths\\Resolve.exe") && k.startsWith("HKLM") ? `"${custom}"` : null);
  assert.equal(findWindowsEditor("resolve", { fsImpl, env, readRegistry }), custom);
});

test("Final Cut is never found or offered on Windows", () => {
  assert.equal(findWindowsEditor("finalcut", deps), null);
  assert.equal(ed.findApp("finalcut", { platform: "win32", ...deps }), null);
  assert.ok(!ed.offeredEditors("win32").includes("finalcut"));
  assert.ok(ed.offeredEditors("darwin").includes("finalcut"));
});

test("a missing editor is named, says where it looked, and keeps the file", async () => {
  const r: any = await ed.openWithApp(
    { app: "resolve", file: "C:\\clips\\a.mp4" },
    { platform: "win32", fsImpl: fakeFs(["C:\\clips\\a.mp4"]), env, readRegistry: noRegistry, spawn: () => assert.fail("must not launch") },
  );
  assert.equal(r.ok, false);
  assert.equal(r.missing, "DaVinci Resolve");
  assert.match(r.error, /^DaVinci Resolve is not installed \(looked in the registry and Program Files\)/);
  assert.match(r.error, /saved at C:\\clips\\a\.mp4/);
});

test("Premiere is opened empty and the clip is shown, never handed the .mp4 as a document (D-16)", async () => {
  let call: any[] = [];
  const shown: string[] = [];
  const spawn = (cmd: string, args: string[], opts: any) => {
    call = [cmd, args, opts];
    const child: any = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const r: any = await ed.openWithApp(
    { app: "premiere", file: "C:\\clips\\a.mp4" },
    { platform: "win32", ...deps, spawn, showFile: (f: string) => shown.push(f) },
  );
  assert.equal(r.ok, true);
  assert.equal(r.opened, true, "says the editor started");
  assert.equal(r.revealed, true, "says the file was shown");
  assert.deepEqual(call.slice(0, 2), [PREMIERE_25, []]);
  assert.notEqual(call[2].shell, true);
  assert.deepEqual(shown, ["C:\\clips\\a.mp4"]);
});

test("CapCut can't take a project: it opens empty and the file is shown", async () => {
  let call: any[] = [];
  const shown: string[] = [];
  const spawn = (cmd: string, args: string[]) => {
    call = [cmd, args];
    const child: any = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  const r: any = await ed.openWithApp(
    { app: "capcut", file: "C:\\clips\\a.mp4" },
    { platform: "win32", ...deps, spawn, showFile: (f: string) => shown.push(f) },
  );
  assert.equal(r.ok, true);
  assert.equal(r.shown, true);
  assert.equal(r.opened, true);
  assert.equal(r.revealed, true);
  assert.deepEqual(call, [CAPCUT, []]);
  assert.deepEqual(shown, ["C:\\clips\\a.mp4"]);
});

test("a launch that fails says why and keeps the file", async () => {
  const spawn = () => {
    const child: any = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("EACCES")));
    return child;
  };
  const r: any = await ed.openWithApp({ app: "capcut", file: "C:\\clips\\a.mp4" }, { platform: "win32", ...deps, spawn });
  assert.equal(r.ok, false);
  assert.match(r.error, /CapCut would not open: EACCES/);
  assert.match(r.error, /saved at/);
});

test("the file manager is named per system", () => {
  assert.equal(ed.fileManagerName("win32"), "File Explorer");
  assert.equal(ed.fileManagerName("darwin"), "Finder");
});

test("Premiere discovery sorts by the year as a number: 2025 beats CC 2019 (D-11)", () => {
  const old = `${PF}\\Adobe\\Adobe Premiere Pro CC 2019\\Adobe Premiere Pro.exe`;
  const fsImpl = fakeFs([old, PREMIERE_25], { [`${PF}\\Adobe`]: ["Adobe Premiere Pro CC 2019", "Adobe Premiere Pro 2025"] });
  assert.equal(findWindowsEditor("premiere", { fsImpl, env, readRegistry: noRegistry }), PREMIERE_25);
  // The beta has no year: the newest numbered one still wins, and the beta is used only when alone.
  const beta = `${PF}\\Adobe\\Adobe Premiere Pro (Beta)\\Adobe Premiere Pro.exe`;
  const both = fakeFs([beta, PREMIERE_24], { [`${PF}\\Adobe`]: ["Adobe Premiere Pro (Beta)", "Adobe Premiere Pro 2024"] });
  assert.equal(findWindowsEditor("premiere", { fsImpl: both, env, readRegistry: noRegistry }), PREMIERE_24);
});
