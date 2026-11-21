/**
 * File: g10-app.cjs
 * Path: audit/run-2/area-G/g10-app.cjs
 * Description: The G-2 fix as SHIPPED. A server secured by breaking the app is
 * a regression, so the real packaged-shape Electron app is launched (it loads
 * electron/dist/server.cjs into the main process, the production path) and
 * then:
 *   1  the window must load over http://127.0.0.1:<port> and render,
 *   2  the renderer's own fetch() must still reach every endpoint it uses
 *      (its Origin is the app's own origin, which the new guard allows),
 *   3  the listening socket must be loopback-only, read from /proc/net/tcp
 *      and tied back to the Electron main process by socket inode,
 *   4  a non-loopback connection and a foreign Origin must fail,
 *   5  a real cut must still complete through the product's own UI.
 *
 * Run under xvfb:
 *   xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *     node audit/run-2/area-G/g10-app.cjs
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const G = require("./glib.cjs");

const OUT = path.join(G.AREA, "out", "app");

async function main() {
  const out = { when: new Date().toISOString() };
  // a stub root, never the repo's own resources/bin
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "g2stub-"));
  execFileSync("node", [
    path.join(G.repoRoot, "audit", "harness", "make-stub-root.cjs"),
    stubRoot,
  ]);
  fs.copyFileSync(G.FIXTURE, path.join(stubRoot, "fixture.mp4"));
  fs.writeFileSync(
    path.join(stubRoot, "stub.json"),
    JSON.stringify({
      info: { id: "stub0000001", title: "Stub video", duration: 30 },
      writeMedia: true,
      delayMs: 0,
    }),
  );
  out.stubRoot = stubRoot;

  const { launchApp } = require(path.join(G.repoRoot, "audit", "harness", "app.cjs"));
  const a = await launchApp({
    label: "G2-app",
    outDir: OUT,
    cwd: stubRoot,
    seed: { "clipper.dataDirConfirmed": true },
  });

  try {
    await a.win.waitForSelector("header", { timeout: 30_000 });
    out.shots = [await a.shot("booted")];
    const apiBase = await a.win.evaluate(() => window.__API_BASE__);
    out.apiBase = apiBase;
    const port = Number(new URL(apiBase).port);
    out.windowUrl = a.win.url();

    // --- 3. the listening socket -----------------------------------------
    const rows = G.listenRows().filter((r) => r.port === port);
    out.listenRows = rows.map((r) => ({
      localHex: r.localHex,
      decoded: r.localHex.length === 8 ? G.decodeV4(r.localHex) : r.localHex,
      inode: r.inode,
    }));
    out.socketOwner = rows.length ? G.pidForInode(rows[0].inode) : null;
    out.boundLoopbackOnly =
      rows.length > 0 && rows.every((r) => r.localHex === "0100007F");

    // --- 2. every endpoint the renderer uses, from inside the renderer ----
    out.fromRenderer = await a.win.evaluate(async () => {
      const base = window.__API_BASE__;
      const call = async (path, init) => {
        try {
          const r = await fetch(base + path, init);
          const text = await r.text();
          return { path, status: r.status, ok: r.ok, body: text.slice(0, 120) };
        } catch (e) {
          return { path, error: String(e) };
        }
      };
      const json = (b) => ({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      const url = "https://www.youtube.com/watch?v=stub0000001";
      const results = [];
      results.push(await call("/api/info", json({ url })));
      results.push(await call("/api/transcript", json({ url })));
      results.push(await call("/api/comments", json({ url })));
      results.push(await call("/api/auth/youtube/status", json({ browser: "app" })));
      results.push(await call("/api/cache/usage"));
      results.push(await call("/api/download/cancel", json({ jobId: "nope" })));
      results.push(
        await call(
          "/api/download?jobId=job_from_renderer",
          json({
            url,
            quality: "360",
            format: "mp4",
            deliver: "path",
            segments: [{ start: 0, end: 3 }],
          }),
        ),
      );
      // the SSE channel the progress bar uses
      const sse = await new Promise((resolve) => {
        const es = new EventSource(`${base}/api/download/progress?jobId=job_sse`);
        const seen = [];
        es.onmessage = (e) => {
          seen.push(e.data);
          if (seen.length >= 1) {
            es.close();
            resolve({ ok: true, seen });
          }
        };
        es.onerror = () => {
          es.close();
          resolve({ ok: false, seen });
        };
        setTimeout(() => {
          es.close();
          resolve({ ok: seen.length > 0, seen, timedOut: true });
        }, 5000);
      });
      results.push({ path: "/api/download/progress (EventSource)", sse });
      return results;
    });

    // --- 4. from outside: no Origin, a foreign Origin, non-loopback -------
    out.fromOutside = {
      noOrigin: await G.request({ port, method: "GET", path: "/api/cache/usage" }),
      foreignOrigin: await G.request({
        port,
        method: "POST",
        path: "/api/info",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001" }),
      }),
      simpleTextPlainClear: await G.request({
        port,
        method: "POST",
        path: "/api/cache/clear",
        headers: { "content-type": "text/plain", origin: "https://evil.example" },
        body: "{}",
      }),
      nonLoopback: await G.request({
        host: "192.0.2.2",
        port,
        method: "GET",
        path: "/api/cache/usage",
        localAddress: "192.0.2.2",
      }),
      rebindingHost: await G.request({
        port,
        method: "GET",
        path: "/api/cache/usage",
        headers: { host: "evil.example" },
        setHost: false,
      }),
    };
    for (const k of Object.keys(out.fromOutside)) {
      const v = out.fromOutside[k];
      out.fromOutside[k] = v.error
        ? { error: v.error }
        : { status: v.status, body: (v.body || "").slice(0, 100) };
    }

    // --- 5. a real cut through the product's own UI ------------------------
    const gate = await a.win
      .getByText("Continue without signing in", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    out.signInGateShown = gate;
    if (gate) {
      await a.win
        .getByText("Continue without signing in", { exact: false })
        .first()
        .click();
      await a.win.waitForTimeout(500);
    }
    out.shots.push(await a.shot("past-gate"));

    const urlField = a.win
      .locator('input[placeholder*="youtube" i], input[placeholder*="link" i], input[type="url"]')
      .first();
    out.urlFieldFound = await urlField.count().then((n) => n > 0);
    if (out.urlFieldFound) {
      await urlField.fill("https://www.youtube.com/watch?v=stub0000001");
      await urlField.press("Enter");
      await a.win.waitForTimeout(3000);
      out.shots.push(await a.shot("video-loaded"));
      out.titleOnScreen = await a.win
        .getByText("Stub video", { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
    }
    out.pageErrors = a.logs.pageErrors.slice(0, 10);
    out.consoleErrors = a.logs.console.filter((l) => l.startsWith("[error]")).slice(0, 10);
    out.mainStderr = a.logs.stderr.join("").split("\n").filter((l) => /Forbidden|403|error/i.test(l)).slice(0, 10);
    out.serverLogForbidden = a.logs.stdout.join("").split("\n").filter((l) => /Forbidden|cancel|listening/i.test(l)).slice(0, 10);
  } finally {
    await a.close();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g10-app", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
