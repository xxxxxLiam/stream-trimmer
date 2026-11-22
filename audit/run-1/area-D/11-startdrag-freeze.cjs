/**
 * Area D / file:startDrag.
 *
 * Proves that sending file:startDrag with a path that exists, from the
 * renderer, outside a real OS drag gesture, freezes the Electron main process:
 * no later IPC on any channel is ever answered and the window stops
 * responding. The app has to be killed.
 *
 * Control run (--control) sends the same message with a path that does NOT
 * exist, so the guard in electron/main.cjs rejects it and everything keeps
 * working. The difference between the two runs is the proof.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubD";
const CONTROL = process.argv.includes("--control");
const OUT = `/home/user/stream-trimmer/audit/run-1/area-D/out/startdrag${CONTROL ? "-control" : ""}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const target = CONTROL ? "/tmp/definitely-not-here-12345.mp4" : "/etc/hostname";
  console.log(`mode: ${CONTROL ? "CONTROL (path does not exist)" : "REAL (path exists)"}`);
  console.log(`startDrag target: ${target}  exists=${fs.existsSync(target)}`);

  const a = await launchApp({ label: "D-startdrag", cwd: STUB, outDir: OUT,
    seed: { "clipper.dataDirConfirmed": true } });

  try {
    await a.win.waitForSelector("header", { timeout: 20000 });

    // Baseline: the bridge answers.
    const before = await a.win.evaluate(() => window.electronAPI.fileExists("/etc/hostname"));
    console.log("before startDrag: file:exists('/etc/hostname') ->", before);
    console.log("shot before:", await a.shot("before"));

    await a.win.evaluate((t) => { window.electronAPI.startDrag(t); }, target);
    console.log("startDrag sent (ipcRenderer.send, fire and forget)");

    // Same call again, with an 8s deadline. If the main process is wedged it
    // never answers.
    const after = await a.win.evaluate(
      async () =>
        await Promise.race([
          window.electronAPI.fileExists("/etc/hostname").then((v) => `ANSWERED ${v}`),
          new Promise((r) => setTimeout(() => r("NO ANSWER after 8000ms"), 8000)),
        ]),
    ).catch((e) => "evaluate itself never returned: " + String(e).slice(0, 160));
    console.log("after  startDrag: file:exists('/etc/hostname') ->", after);

    // Can the window still be driven at all?
    const clicked = await Promise.race([
      a.win.click("#ui-symbols", { timeout: 6000 }).then(() => "click OK").catch((e) => "click FAILED: " + String(e.message).slice(0, 120)),
      new Promise((r) => setTimeout(() => r("click never returned after 7000ms"), 7000)),
    ]);
    console.log("UI still driveable? ->", clicked);

    const shot = await Promise.race([
      a.shot("after").catch((e) => "screenshot failed: " + e.message),
      new Promise((r) => setTimeout(() => r("screenshot never returned after 7000ms"), 7000)),
    ]);
    console.log("shot after:", shot);
  } catch (e) {
    console.log("HARNESS ERROR (consistent with a wedged main process):", String(e).slice(0, 300));
  } finally {
    await Promise.race([
      a.close(),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    console.log("close() returned or gave up");
  }
  process.exit(0);
})();
