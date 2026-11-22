#!/usr/bin/env node
/**
 * G area, audit-only. The as-shipped check: the packaged-shape Electron app
 * (electron/dist/server.cjs, required into the main process) — where does its
 * HTTP server actually listen, and who may call it?
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *        node audit/run-1/area-G/g13-asshipped.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./lib.cjs");

const OUT = path.join(__dirname, "out-g13");

const listenRows = (port) => {
  const hex = port.toString(16).padStart(4, "0").toUpperCase();
  const scan = (f) => {
    try {
      return fs.readFileSync(f, "utf8").split("\n").slice(1)
        .map((l) => l.trim().split(/\s+/))
        .filter((c) => c[1] && c[1].toUpperCase().endsWith(":" + hex) && c[3] === "0A")
        .map((c) => ({ table: path.basename(f), localAddrHex: c[1] }));
    } catch { return []; }
  };
  return [...scan("/proc/net/tcp"), ...scan("/proc/net/tcp6")];
};

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = L.makeStub("asshipped");
  L.setStub(stub, { info: { id: "stub0000001", title: "Stub video", duration: 30 } });

  // A settings.json that is not JSON at all, written straight into the user
  // data dir the app will use, to prove the app and its server still boot.
  const a = await L.launchApp({ label: "G-asshipped", cwd: stub, seed: { "clipper.dataDirConfirmed": true } });
  const W = L.livePage(a);
  const r = {};
  try {
    const page = await W();
    const base = await page.evaluate(() => window.__API_BASE__);
    const port = Number(String(base).split(":").pop());
    r.apiBase = base;
    r.port = port;
    r.kernelListenRows = listenRows(port);
    r.boundToAllInterfaces = r.kernelListenRows.some((x) => /^0+:/.test(x.localAddrHex));
    r.nonLoopbackIps = Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);

    // Reach it from a non-loopback address, from OUTSIDE the renderer.
    r.offLoopback = [];
    for (const ip of r.nonLoopbackIps) {
      const got = await fetch(`http://${ip}:${port}/api/cache/usage`)
        .then(async (x) => ({ ip, status: x.status, body: (await x.text()).slice(0, 150) }))
        .catch((e) => ({ ip, error: String(e.message || e).slice(0, 150) }));
      r.offLoopback.push(got);
    }

    // Cross-origin: a page on any site could do this.
    r.corsPreflight = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    }).then((x) => ({ status: x.status, allowOrigin: x.headers.get("access-control-allow-origin"), allowMethods: x.headers.get("access-control-allow-methods") }))
      .catch((e) => ({ error: String(e.message) }));

    r.corsPost = await fetch(`http://127.0.0.1:${port}/api/info`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001" }),
    }).then(async (x) => ({ status: x.status, allowOrigin: x.headers.get("access-control-allow-origin"), body: (await x.text()).slice(0, 150) }))
      .catch((e) => ({ error: String(e.message) }));

    // A malformed JSON body on the correct verb and route, in the real app.
    r.malformedBody = await fetch(`http://127.0.0.1:${port}/api/info`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{ not json",
    }).then(async (x) => ({ status: x.status, contentType: x.headers.get("content-type"), body: (await x.text()).slice(0, 900) }))
      .catch((e) => ({ error: String(e.message) }));
    if (r.malformedBody.body) {
      r.malformedBody.looksHtml = /^\s*(<!DOCTYPE|<html)/i.test(r.malformedBody.body);
      r.malformedBody.absolutePaths = (r.malformedBody.body.match(/\/(?:home|Users|root)\/[\w./@-]+/g) || []).slice(0, 5);
    }

    r.tooBigBody = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=stub0000001", pad: "A".repeat(10 * 1024 * 1024) }),
    }).then(async (x) => { const t = await x.text(); return { status: x.status, contentType: x.headers.get("content-type"), looksHtml: /^\s*(<!DOCTYPE|<html)/i.test(t), absolutePaths: (t.match(/\/(?:home|Users|root)\/[\w./@-]+/g) || []).slice(0, 5), body: t.slice(0, 400) }; })
      .catch((e) => ({ error: String(e.message) }));

    // And the cookie file the packaged app configures: only from the env.
    r.cookieFileFromEnv = await page.evaluate(async () => {
      const res = await fetch(`${window.__API_BASE__}/api/auth/youtube/status`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ browser: "/etc/passwd" }),
      });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    });
    r.shot = await a.shot("as-shipped");
  } finally {
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(r, null, 2));
    fs.writeFileSync(path.join(OUT, "app-log.txt"), a.logs.stdout.join("") + "\n==STDERR==\n" + a.logs.stderr.join(""));
    await a.close();
  }
  console.log(JSON.stringify(r, null, 2));
  console.log(`\nresults: ${path.join(OUT, "results.json")}`);
  console.log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
