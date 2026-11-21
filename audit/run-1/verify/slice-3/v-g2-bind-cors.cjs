/**
 * v-g2-bind-cors.cjs — VERIFY G-2: "the server listens on every network
 * interface, not loopback, and allows any origin".
 *
 * Written from the finding's Steps, from scratch. Three independent lines of
 * evidence, plus two deliberate attempts to disprove:
 *
 *  A. The listening socket itself. /proc/net/tcp LISTEN row for the app's own
 *     port, local address decoded, AND the socket inode tied back to a pid so
 *     the row provably belongs to the Electron main process and not to some
 *     other listener that happens to share the port space.
 *  B. A connection from a NON-LOOPBACK source address (eth0, 192.0.2.2) to the
 *     app's port on the non-loopback address, made from this node process —
 *     outside the renderer, with no browser in the way.
 *  C. A CONTROL: a server I start myself, bound to 127.0.0.1 only, on which
 *     the very same probe must FAIL. Without this, "192.0.2.2 answered" could
 *     be an artefact of how this container routes its own addresses.
 *  D. CORS: a real preflight and a real cross-origin POST with
 *     Origin: https://evil.example, reading the response headers.
 *  E. What an unauthenticated off-box caller actually reaches, and
 *     specifically: does any of it WRITE A FILE, and does any of it make the
 *     server hand the user's cookie jar to a child process?
 *
 * Run: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-g2-bind-cors.cjs [runLabel]
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const L = require("./v-lib.cjs");

const EXT = "192.0.2.2"; // this container's eth0 address (os.networkInterfaces)
const EVIL = "https://evil.example";
const T0 = Date.now();
const step = (m) => process.stderr.write(`[+${((Date.now()-T0)/1000).toFixed(1)}s] ${m}\n`);

async function controlLoopbackOnly() {
  // A server bound to loopback only, to prove the probe can tell the difference.
  const srv = http.createServer((_q, s) => s.end("control"));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const sock = L.listeningSockets(port);
  const viaLoopback = await L.req({ host: "127.0.0.1", port, path: "/" });
  const viaExt = await L.req({ host: EXT, port, path: "/", localAddress: EXT, timeout: 4000 });
  await new Promise((r) => srv.close(r));
  return {
    port,
    procRows: sock.map((s) => ({ addr: L.decodeHexAddr(s.localHex), hex: s.localHex })),
    viaLoopback: { status: viaLoopback.status, error: viaLoopback.error },
    viaExt: { status: viaExt.status, error: viaExt.error },
  };
}

(async () => {
  const runLabel = process.argv[2] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString(), extAddr: EXT };

  // The control runs first, with no app in the way.
  step("control: loopback-only server");
  out.control_loopbackOnlyServer = await controlLoopbackOnly();

  step("launching app");
  const stubRoot = L.makeStub(`g2-${runLabel}`);
  const a = await L.launchMirror({ shape: "public", label: `v-g2-${runLabel}`, stubRoot });
  out.apiBase = a.apiBase;
  out.port = a.port;
  await a.win.waitForSelector("header", { timeout: 20000 });

  // A real (synthetic) signed-in cookie jar where the app keeps it, so the
  // auth route has something to hand a child.
  const jar = path.join(a.userDataDir, "yt-cookies.txt");
  fs.writeFileSync(jar, L.cookieJarText());
  out.cookieJar = jar;

  step("A: /proc/net/tcp");
  // ---- A. the listening socket -----------------------------------------
  const rows = L.listeningSockets(a.port);
  out.A_listenRows = rows.map((r) => ({
    file: r.file,
    localHex: r.localHex,
    decoded: L.decodeHexAddr(r.localHex),
    isWildcard: r.localHex === "00000000" || r.localHex === "0".repeat(32),
    isLoopback: r.localHex === "0100007F",
    inode: r.inode,
    pids: r.pids,
    raw: r.raw,
  }));
  out.A_boundToWildcard = out.A_listenRows.some((r) => r.isWildcard);
  out.A_boundToLoopbackOnly =
    out.A_listenRows.length > 0 && out.A_listenRows.every((r) => r.isLoopback);
  out.A_ownedByElectronMain = out.A_listenRows.some((r) =>
    (r.pids || []).some((p) => /electron/i.test(p.cmdline) && /main\.cjs/.test(p.cmdline)),
  );

  // ---- B. from a non-loopback source address ----------------------------
  step("B: non-loopback request");
  const viaExt = await L.req({ host: EXT, port: a.port, path: "/api/cache/usage", localAddress: EXT, timeout: 15000 });
  const viaLoop = await L.req({ host: "127.0.0.1", port: a.port, path: "/api/cache/usage" });
  out.B_fromExternalAddress = {
    url: `http://${EXT}:${a.port}/api/cache/usage`,
    status: viaExt.status,
    body: (viaExt.body || "").slice(0, 200),
    error: viaExt.error,
    socketLocalAddress: viaExt.localAddress,
    socketRemoteAddress: viaExt.remoteAddress,
  };
  out.B_fromLoopback = { status: viaLoop.status, body: (viaLoop.body || "").slice(0, 200) };

  // ---- D. CORS ----------------------------------------------------------
  step("D: CORS");
  const pre = await L.req({
    host: EXT, port: a.port, localAddress: EXT, method: "OPTIONS", path: "/api/download",
    headers: { origin: EVIL, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  out.D_preflight = {
    status: pre.status,
    allowOrigin: pre.headers && pre.headers["access-control-allow-origin"],
    allowMethods: pre.headers && pre.headers["access-control-allow-methods"],
    allowHeaders: pre.headers && pre.headers["access-control-allow-headers"],
    vary: pre.headers && pre.headers.vary,
  };
  const xo = await L.jsonReq({
    host: EXT, port: a.port, localAddress: EXT, path: "/api/info",
    headers: { origin: EVIL },
    body: { url: "https://www.youtube.com/watch?v=stub0000001" },
  });
  out.D_crossOriginPost = {
    status: xo.status,
    allowOrigin: xo.headers && xo.headers["access-control-allow-origin"],
    body: (xo.body || "").slice(0, 200),
  };
  // A simple-content-type POST is what a page can send with no preflight at all.
  const simple = await L.req({
    host: EXT, port: a.port, localAddress: EXT, method: "POST", path: "/api/cache/clear",
    headers: { origin: EVIL, "content-type": "text/plain" }, body: "",
  });
  out.D_simpleContentTypePost = { status: simple.status, body: (simple.body || "").slice(0, 160) };

  // ---- E. what an off-box caller reaches -------------------------------
  L.clearArgvLog(stubRoot);
  step("E: endpoint sweep");
  const probes = [];
  const call = async (name, o) => {
    const r = await (o.json ? L.jsonReq : L.req)({ ...o, host: EXT, port: a.port, localAddress: EXT });
    step("  E: " + name);
    probes.push({ name, method: o.method || (o.json ? "POST" : "GET"), path: o.path, status: r.status, ct: r.headers && r.headers["content-type"], body: (r.body || "").slice(0, 220), error: r.error });
    return r;
  };
  await call("GET /api/cache/usage", { path: "/api/cache/usage" });
  await call("POST /api/info", { json: 1, path: "/api/info", body: { url: "https://www.youtube.com/watch?v=stub0000001" } });
  await call("POST /api/transcript", { json: 1, path: "/api/transcript", body: { url: "https://www.youtube.com/watch?v=stub0000001" } });
  await call("POST /api/comments", { json: 1, path: "/api/comments", body: { url: "https://www.youtube.com/watch?v=stub0000001" } });
  const auth = await call("POST /api/auth/youtube/status {browser:app}", {
    json: 1, path: "/api/auth/youtube/status", body: { browser: "app" },
  });
  const dl = await call("POST /api/download (deliver:path)", {
    json: 1, path: "/api/download",
    body: { url: "https://www.youtube.com/watch?v=stub0000001", quality: "360", format: "mp4", deliver: "path", segments: [{ start: 0, end: 4 }] },
  });
  await call("GET /api/download/progress?jobId=x", { path: "/api/download/progress?jobId=probe_from_offbox", timeout: 5000 });
  out.E_reachable = probes;

  // Did the download actually write a file on this machine?
  let wrote = null;
  try {
    const p = JSON.parse(dl.body).path;
    wrote = { path: p, exists: fs.existsSync(p), bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  } catch (e) { wrote = { error: String(e.message) }; }
  out.E_offBoxCallWroteAFile = wrote;

  // Did the auth route hand the user's canonical cookie jar to a child?
  const argv = L.argvLog(stubRoot);
  const cookieArgs = argv
    .filter((r) => r.argv.includes("--cookies"))
    .map((r) => ({ cookiesValue: r.argv[r.argv.indexOf("--cookies") + 1], firstArg: r.argv[0] }));
  out.E_childrenGivenCookieFile = cookieArgs;
  out.E_canonicalJarHandedToChild = cookieArgs.some((c) => c.cookiesValue === jar);
  out.E_authVerdict = (() => { try { return JSON.parse(auth.body).status; } catch { return auth.body; } })();

  step("wrapping up");
  out.serverListenLine = a.logs.stdout.join("").split("\n").filter((l) => /listening on/.test(l));
  out.shot = await a.shot("app-running");
  await a.close();

  out.verdict = {
    boundToWildcard: out.A_boundToWildcard,
    answeredOnNonLoopback: out.B_fromExternalAddress.status === 200,
    controlDiscriminates:
      out.control_loopbackOnlyServer.viaLoopback.status === 200 &&
      out.control_loopbackOnlyServer.viaExt.status === undefined,
    corsWildcard: out.D_preflight.allowOrigin === "*" && out.D_crossOriginPost.allowOrigin === "*",
  };

  console.log(JSON.stringify(out.verdict, null, 2));
  console.log(L.save(`v-g2-${runLabel}.json`, out));
})();
