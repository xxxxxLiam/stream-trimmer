/**
 * File: updateController.test.ts
 * Path: src/main/modules/updater/updateController.test.ts
 * Description: Pins the approved update behaviour: the switch, one updateReady event, a restart that
 *   waits for clips, and no dialog or OS notification anywhere.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import test from "node:test";
import { createUpdateController, type UpdaterLike } from "./updateController";

function setup(opts: { canInstall?: boolean; auto?: boolean; clips?: number } = {}) {
  const em = new EventEmitter();
  const calls = { quit: 0, check: 0 };
  const updater = Object.assign(em, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: async () => { calls.check += 1; return null; },
    quitAndInstall: () => { calls.quit += 1; },
  }) as unknown as UpdaterLike & EventEmitter;
  const state = { auto: opts.auto ?? true, clips: opts.clips ?? 0 };
  const waiting: boolean[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const ready: unknown[] = [];
  const status: unknown[] = [];
  const c = createUpdateController({
    updater,
    canInstall: opts.canInstall ?? true,
    autoUpdate: () => state.auto,
    activeClips: () => state.clips,
    sendStatus: (p) => status.push(p),
    sendReady: (p) => ready.push(p),
    sendRestartWaiting: (w) => waiting.push(w),
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimer: (h) => { (h as { live: boolean }).live = false; },
    downloadUrl: (v) => `https://example.test/${v}.dmg`,
    releasesUrl: () => "https://example.test/releases",
    log: () => {},
  });
  c.attach();
  /** Runs the idle timer that is still live, as the clock would. */
  const fire = () => { const t = timers.find((x) => x.live); if (t) { t.live = false; t.fn(); } };
  return { c, em, updater, calls, state, ready, status, waiting, timers, fire };
}

test("switch off: nothing downloads automatically", () => {
  const t = setup({ auto: false });
  assert.equal(t.updater.autoDownload, false);
  t.state.auto = true;
  t.c.onAutoUpdateChanged();
  assert.equal(t.updater.autoDownload, true);
});

test("a downloaded update sends one updateReady with mode restart", () => {
  const t = setup();
  t.em.emit("update-downloaded", { version: "1.4.0" });
  assert.deepEqual(t.ready, [{ version: "1.4.0", mode: "restart" }]);
  assert.deepEqual(t.c.pendingReady(), { version: "1.4.0", mode: "restart" });
});

test("restart during a clip does not restart now: it waits, and works once idle", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  assert.deepEqual(t.c.restartToUpdate(), { ok: true, waiting: true });
  assert.equal(t.calls.quit, 0);
  assert.equal(t.c.restartWaiting(), true);
  t.state.clips = 0;
  t.c.cancelRestart();
  assert.deepEqual(t.c.restartToUpdate(), { ok: true });
  assert.equal(t.calls.quit, 1);
});

test("a waiting restart restarts by itself after the clips finish and stay finished", () => {
  const t = setup({ clips: 2 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  assert.deepEqual(t.waiting, [true]);
  t.state.clips = 1;
  t.c.applyPolicy();
  assert.equal(t.timers.length, 0, "one clip still being made: no timer");
  t.state.clips = 0;
  t.c.applyPolicy();
  assert.equal(t.timers.length, 1);
  assert.equal(t.calls.quit, 0, "not before the idle period");
  t.fire();
  assert.equal(t.calls.quit, 1);
  assert.equal(t.c.restartWaiting(), false);
  assert.deepEqual(t.waiting, [true, false]);
});

test("a clip that starts in the idle gap cancels the pending restart; it goes ahead after that clip", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  t.state.clips = 0;
  t.c.applyPolicy();
  t.state.clips = 1; // the next clip of the queue starts
  t.c.applyPolicy();
  t.fire();
  assert.equal(t.calls.quit, 0);
  assert.equal(t.c.restartWaiting(), true);
  t.state.clips = 0;
  t.c.applyPolicy();
  t.fire();
  assert.equal(t.calls.quit, 1);
});

test("pressing again cancels the wait: no restart, the pill is told, and the update still installs on quit", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  assert.equal(t.c.cancelRestart(), true);
  assert.deepEqual(t.waiting, [true, false]);
  t.state.clips = 0;
  t.c.applyPolicy();
  t.fire();
  assert.equal(t.calls.quit, 0);
  assert.equal(t.updater.autoInstallOnAppQuit, true);
  assert.equal(t.c.cancelRestart(), false, "nothing left to cancel");
});

test("cancelling inside the idle gap clears the timer, so a later wait starts a fresh idle period", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  t.state.clips = 0;
  t.c.applyPolicy();
  assert.equal(t.timers[0].live, true);
  t.c.cancelRestart();
  assert.equal(t.timers[0].live, false);
  t.state.clips = 1;
  t.c.restartToUpdate();
  t.state.clips = 0;
  t.c.applyPolicy();
  assert.equal(t.timers.length, 2, "a new timer, not the old one");
});

test("asking twice while waiting arms one wait, not two", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  t.c.restartToUpdate();
  assert.deepEqual(t.waiting, [true]);
});

test("a deferred restart that fails to install says so in the log and stops waiting", () => {
  const t = setup({ clips: 1 });
  t.updater.quitAndInstall = () => { throw new Error("boom"); };
  t.em.emit("update-downloaded", { version: "1.4.0" });
  t.c.restartToUpdate();
  t.state.clips = 0;
  t.c.applyPolicy();
  t.fire();
  assert.equal(t.c.restartWaiting(), false);
});

test("restart with nothing downloaded refuses", () => {
  assert.deepEqual(setup().c.restartToUpdate(), { ok: false, reason: "nothing-ready" });
});

test("install on quit is held while a clip is being made", () => {
  const t = setup({ clips: 1 });
  assert.equal(t.updater.autoInstallOnAppQuit, false);
  t.state.clips = 0;
  t.c.applyPolicy();
  assert.equal(t.updater.autoInstallOnAppQuit, true);
});

test("unsigned Mac: the pill gets mode download with the installer url, nothing installs", () => {
  const t = setup({ canInstall: false });
  assert.equal(t.updater.autoDownload, false);
  assert.equal(t.updater.autoInstallOnAppQuit, false);
  t.em.emit("update-available", { version: "1.4.0" });
  assert.deepEqual(t.ready, [{ version: "1.4.0", mode: "download", url: "https://example.test/1.4.0.dmg" }]);
  assert.deepEqual(t.c.restartToUpdate(), { ok: false, reason: "nothing-ready" });
});

test("no dialog and no OS notification anywhere in the updater", () => {
  for (const f of ["autoUpdater.ts", "updateController.ts", "../../features/updates/services/updatesService.ts"]) {
    const src = fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /showMessageBox|\bdialog\b|checkForUpdatesAndNotify|new Notification/, f);
  }
});
