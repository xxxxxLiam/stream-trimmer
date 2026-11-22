/**
 * File: g1-bind-cors.cjs
 * Path: audit/run-2/area-G/g1-bind-cors.cjs
 * Description: Re-verifies run-1 G-2 (bind address + cross-origin access) on
 * the fixed tree, and attacks the new origin/host guard.
 *
 *  1. The bind, from the LISTENING SOCKET itself (/proc/net/tcp, inode tied
 *     back to the server's pid).
 *  2. A real connection from this machine's non-loopback address (192.0.2.2),
 *     the exact route run 1 used to make the app write a 981,457-byte file.
 *  3. A CONTROL server bound to 0.0.0.0, probed identically — if the probe
 *     cannot tell the two apart it proves nothing.
 *  4. The origin guard: foreign Origin, "null" Origin, no-preflight text/plain
 *     POST to /api/cache/clear, the app's own origin, the dev origin, no
 *     Origin at all, and Host-header rebinding.
 *  5. Whether a refused request still spawns yt-dlp.
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const G = require("./glib.cjs");

const OFF = "192.0.2.2";

async function main() {
  const out = { when: new Date().toISOString() };
  const s = await G.startServer({ label: "bind", cfg: { duration: 30 } });

  // --- 1. the listening socket itself -------------------------------------
  const rows = G.listenRows().filter((r) => r.port === s.port);
  out.listenRows = rows.map((r) => ({
    file: r.file,
    localHex: r.localHex,
    decoded: r.localHex.length === 8 ? G.decodeV4(r.localHex) : r.localHex,
    inode: r.inode,
  }));
  out.socketOwner = rows.length ? G.pidForInode(rows[0].inode) : null;
  out.boundLoopbackOnly =
    rows.length > 0 && rows.every((r) => r.localHex === "0100007F");

  // --- 2. a real connection from the non-loopback address ------------------
  const offLoopback = await G.request({
    host: OFF,
    port: s.port,
    method: "GET",
    path: "/api/cache/usage",
    localAddress: OFF,
  });
  out.fromNonLoopback = offLoopback;

  // and the write-a-file attack run 1 landed
  const offDownload = await G.request({
    host: OFF,
    port: s.port,
    method: "POST",
    path: "/api/download",
    localAddress: OFF,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: G.YT_URL,
      quality: "360",
      format: "mp4",
      deliver: "path",
      segments: [{ start: 0, end: 4 }],
    }),
  });
  out.downloadFromNonLoopback = offDownload;
  out.workFoldersAfterOffLoopbackAttack = s.workFolders();

  // --- 3. control: a server that IS bound to 0.0.0.0 -----------------------
  const control = http.createServer((_q, r) => r.end("control"));
  await new Promise((r) => control.listen(0, "0.0.0.0", r));
  const cport = control.address().port;
  const controlRow = G.listenRows().filter((r) => r.port === cport);
  out.control = {
    port: cport,
    rows: controlRow.map((r) => r.localHex),
    viaLoopback: await G.request({ port: cport, path: "/" }),
    viaNonLoopback: await G.request({
      host: OFF,
      port: cport,
      path: "/",
      localAddress: OFF,
    }),
  };
  control.close();

  // --- 4. the origin / host guard -----------------------------------------
  const originCases = [
    { name: "foreign origin, JSON POST /api/info", origin: "https://evil.example" },
    { name: "foreign origin, http", origin: "http://evil.example" },
    { name: "null origin (file:// or sandboxed iframe)", origin: "null" },
    { name: "own origin", origin: `http://127.0.0.1:${s.port}` },
    { name: "own origin via localhost", origin: `http://localhost:${s.port}` },
    { name: "dev renderer origin", origin: "http://localhost:8080" },
    { name: "dev renderer origin 127.0.0.1:8080", origin: "http://127.0.0.1:8080" },
    { name: "https on the app's own port", origin: `https://127.0.0.1:${s.port}` },
    { name: "own origin with a trailing slash", origin: `http://127.0.0.1:${s.port}/` },
    { name: "uppercase host in origin", origin: `http://LOCALHOST:${s.port}` },
    { name: "no origin at all (Electron main, curl)", origin: undefined },
  ];
  out.origins = [];
  for (const c of originCases) {
    s.clearCalls();
    const r = await s.post(
      "/api/info",
      { url: G.YT_URL },
      { headers: c.origin === undefined ? {} : { origin: c.origin } },
    );
    out.origins.push({
      ...c,
      status: r.status,
      allowOrigin: r.headers["access-control-allow-origin"] ?? null,
      ytRuns: s.calls().length,
      body: (r.body || "").slice(0, 120),
    });
  }

  // preflight
  out.preflights = [];
  for (const origin of ["https://evil.example", `http://127.0.0.1:${s.port}`]) {
    const r = await G.request({
      port: s.port,
      method: "OPTIONS",
      path: "/api/download",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    out.preflights.push({
      origin,
      status: r.status,
      allowOrigin: r.headers["access-control-allow-origin"] ?? null,
      allowMethods: r.headers["access-control-allow-methods"] ?? null,
    });
  }

  // the no-preflight simple POST a web page can always send
  const decoy = path.join(s.serverTmp, "ytclip-DECOY-0000");
  fs.mkdirSync(decoy, { recursive: true });
  fs.writeFileSync(path.join(decoy, "file"), "x".repeat(1024));
  const simplePost = await G.request({
    port: s.port,
    method: "POST",
    path: "/api/cache/clear",
    headers: { "content-type": "text/plain", origin: "https://evil.example" },
    body: "{}",
  });
  out.simpleCrossOriginClear = {
    status: simplePost.status,
    body: simplePost.body.slice(0, 160),
    decoyStillThere: fs.existsSync(decoy),
  };

  // Host-header rebinding
  out.hosts = [];
  for (const host of [
    "evil.example",
    "evil.example:1234",
    `127.0.0.1.nip.io:${s.port}`,
    "localhost",
    `127.0.0.1:${s.port}`,
    "127.0.0.2",
    "0.0.0.0",
    "[::1]",
    `LOCALHOST:${s.port}`,
    "",
  ]) {
    const r = await G.request({
      port: s.port,
      method: "GET",
      path: "/api/cache/usage",
      headers: { host },
      setHost: false,
    });
    out.hosts.push({ host, status: r.status, body: (r.body || "").slice(0, 80) });
  }

  // GET endpoints and the SSE stream behind the guard
  out.guardedRoutes = [];
  for (const route of ["/api/cache/usage", "/api/download/progress?jobId=x"]) {
    const bad = await G.request({
      port: s.port,
      method: "GET",
      path: route,
      headers: { origin: "https://evil.example" },
      timeout: 4000,
    });
    out.guardedRoutes.push({ route, status: bad.status, body: (bad.body || "").slice(0, 80) });
  }

  out.serverLogTail = s.log().split("\n").slice(-12);
  await s.stop();
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g1-bind-cors", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
