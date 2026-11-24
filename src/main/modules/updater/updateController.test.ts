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
  const ready: unknown[] = [];
  const status: unknown[] = [];
  const c = createUpdateController({
    updater,
    canInstall: opts.canInstall ?? true,
    autoUpdate: () => state.auto,
    activeClips: () => state.clips,
    sendStatus: (p) => status.push(p),
    sendReady: (p) => ready.push(p),
    downloadUrl: (v) => `https://example.test/${v}.dmg`,
    releasesUrl: () => "https://example.test/releases",
    log: () => {},
  });
  c.attach();
  return { c, em, updater, calls, state, ready, status };
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

test("restart is refused while a clip is being made, and works once idle", () => {
  const t = setup({ clips: 1 });
  t.em.emit("update-downloaded", { version: "1.4.0" });
  assert.deepEqual(t.c.restartToUpdate(), { ok: false, reason: "busy" });
  assert.equal(t.calls.quit, 0);
  t.state.clips = 0;
  assert.deepEqual(t.c.restartToUpdate(), { ok: true });
  assert.equal(t.calls.quit, 1);
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
