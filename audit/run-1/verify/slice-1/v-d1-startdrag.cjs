/**
 * v-d1-startdrag.cjs — D-1. Does dragging a clip out of the window wedge the
 * app, and is the wedge the product's fault or this container's?
 *
 * Arms (each its own cold start):
 *   ipc-real    — send file:startDrag with a path that EXISTS, then time how
 *                 long any other bridge call takes to answer.
 *   ipc-missing — the same with a path that does NOT exist (main returns before
 *                 startDrag), as the control.
 *   gesture     — cut a real clip, then drag the toast's grip with the mouse,
 *                 the gesture the feature exists for, and probe IPC after.
 * Every arm also tries to get the app back: mouse up, Escape, a second IPC
 * call, a renderer-only evaluate, and a screenshot.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-d1-startdrag.cjs <arm>
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, loadUrl } = require("./v-lib.cjs");

const arm = process.argv[2] || "ipc-real";
const CLIPS = "/tmp/v-d1-clips";

/** Ask the bridge something and say how long it took, or that it never answered. */
async function ipcPing(a, label, timeoutMs = 10000) {
  const started = Date.now();
  const res = await Promise.race([
    a.win
      .evaluate(() => window.electronAPI.fileExists("/etc/hostname"))
      .then((v) => `answered ${JSON.stringify(v)}`)
      .catch((e) => `evaluate threw: ${e.message.split("\n")[0]}`),
    new Promise((r) => setTimeout(() => r(`*** NO ANSWER after ${timeoutMs}ms ***`), timeoutMs)),
  ]);
  a.log(`  IPC ping [${label}]: ${res} (${Date.now() - started}ms)`);
  return res;
}

/** Something that needs only the renderer, no main-process round trip. */
async function rendererPing(a, label, timeoutMs = 8000) {
  const res = await Promise.race([
    a.win
      .evaluate(() => document.title + "|" + document.body.innerText.length)
      .then((v) => `renderer answered: ${v}`)
      .catch((e) => `renderer threw: ${e.message.split("\n")[0]}`),
    new Promise((r) => setTimeout(() => r(`*** RENDERER SILENT after ${timeoutMs}ms ***`), timeoutMs)),
  ]);
  a.log(`  renderer ping [${label}]: ${res}`);
  return res;
}

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: `v-d1-${arm}`,
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": CLIPS },
  });
  let killed = false;
  try {
    await ipcPing(a, "baseline");
    await rendererPing(a, "baseline");

    if (arm === "gesture") {
      await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
      await a.win.waitForTimeout(1500);
      await a.win.locator("#ui-mark-in:visible").first().fill("00:00:02");
      await a.win.locator("#ui-mark-out:visible").first().fill("00:00:08");
      await a.win.keyboard.press("Control+Shift+Enter");
      await a.win.locator("#ui-cut:visible").first().click();
      for (let i = 0; i < 30; i++) {
        await a.win.waitForTimeout(2000);
        if (fs.readdirSync(CLIPS).length) break;
      }
      a.log("clip on disk:", fs.readdirSync(CLIPS));
      const grip = a.win.locator('[aria-label^="Drag "]').first();
      await grip.waitFor({ timeout: 15000 });
      const box = await grip.boundingBox();
      a.log("drag grip box:", box);
      await a.shot("drag-handle");

      await a.win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await a.win.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await a.win.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2 + i * 8);
      }
      await a.win.mouse.up().catch((e) => a.log("  mouse.up threw:", e.message.split("\n")[0]));
      a.log("real mouse drag gesture completed");
    } else {
      const target = arm === "ipc-missing" ? "/tmp/definitely-not-here-12345.mp4" : null;
      let file = target;
      if (!file) {
        file = path.join(CLIPS, "a-real-file.mp4");
        fs.copyFileSync("/home/user/stream-trimmer/audit/fixtures/fixture.mp4", file);
      }
      a.log(`sending file:startDrag with ${file} (exists: ${fs.existsSync(file)})`);
      await a.win
        .evaluate((p) => window.electronAPI.startDrag(p), file)
        .catch((e) => a.log("  send threw:", e.message.split("\n")[0]));
    }

    await ipcPing(a, "right after the drag");
    await rendererPing(a, "right after the drag");

    // Try to get out of it.
    await a.win.mouse.up().catch(() => {});
    await a.win.keyboard.press("Escape").catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));
    await ipcPing(a, "after mouse-up + Escape + 5s");
    await new Promise((r) => setTimeout(r, 15000));
    const last = await ipcPing(a, "20s later");
    await a.shot("after-drag").catch((e) => a.log("  screenshot failed:", e.message.split("\n")[0]));

    if (String(last).includes("NO ANSWER")) {
      a.log("VERDICT for this arm: the main process never answered again");
      killed = true;
    } else {
      a.log("VERDICT for this arm: the app kept working");
    }
  } finally {
    a.log("PROOF:", a.writeLog());
    if (killed) {
      // app.close() hangs on a wedged main process; kill it.
      try {
        a.app.process().kill("SIGKILL");
      } catch {}
    } else {
      await a.close();
    }
    process.exit(0);
  }
})();
