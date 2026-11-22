#!/usr/bin/env node
/**
 * G area, audit-only. THE COOKIE JAR CONCURRENCY HAZARD.
 *
 * Real yt-dlp rewrites whatever file it was given as --cookies on close
 * (YoutubeDL.save_cookies). server/cookieJar.ts exists to stop that landing on
 * the user's canonical jar: every run is supposed to get a private copy.
 *
 * This proves, per endpoint, WHICH path the canonical file is handed to a child
 * on, and what two concurrent runs do to it. The stub does the same write-back
 * real yt-dlp does (mk-gstub.cjs), with an optional half-written window.
 *
 * Run: node audit/run-1/area-G/g5-cookiejar.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g5");
const JAR = () => path.join(OUT, "yt-cookies.txt");
const results = [];

const GOOD = (tag) =>
  "# Netscape HTTP Cookie File\n" +
  `.youtube.com\tTRUE\t/\tTRUE\t9999999999\tSID\tsid-${tag}\n` +
  `.youtube.com\tTRUE\t/\tTRUE\t9999999999\t__Secure-3PSID\tpsid-${tag}\n` +
  `.youtube.com\tTRUE\t/\tTRUE\t9999999999\tPREF\tpref-${tag}\n`;

// server/cookieJar.ts's own definition of "this jar still holds a sign-in".
const { jarHasSignIn } = require(path.join(S.REPO, "server", "cookieJar.ts"));

const writeJar = (tag) => fs.writeFileSync(JAR(), GOOD(tag));
const readJar = () => { try { return fs.readFileSync(JAR(), "utf8"); } catch (e) { return `<<unreadable: ${e.code}>>`; } };
const jarState = () => {
  const t = readJar();
  return {
    bytes: t.length,
    signedIn: jarHasSignIn(t),
    sid: (t.match(/\tSID\t(\S+)/) || [])[1] || null,
    lines: t.split("\n").filter(Boolean).length,
    tail: t.slice(-60).replace(/\n/g, "\\n"),
  };
};

function report(name, before, after, extra) {
  const row = { name, before, after, ...extra };
  results.push(row);
  console.log(`\n## ${name}`);
  console.log(`  before: ${JSON.stringify(before)}`);
  console.log(`  after : ${JSON.stringify(after)}`);
  for (const [k, v] of Object.entries(extra || {})) console.log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  const lost = before.signedIn && !after.signedIn;
  console.log(`  >>> SIGN-IN LOST: ${lost}   OVERWRITTEN BY A CHILD: ${before.sid !== after.sid}`);
  row.signInLost = lost;
  row.overwritten = before.sid !== after.sid;
  return row;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g5");
  let s;

  // ---- 1. Which endpoints hand the CANONICAL file to the child? ----------
  writeJar("original");
  S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, cookieWriteBack: null });
  s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
  console.log("=== 1. WHICH --cookies PATH DOES EACH ENDPOINT GIVE yt-dlp? ===");
  const probes = [
    ["/api/info", { url: S.YT, cookiesFromBrowser: "app" }],
    ["/api/transcript", { url: S.YT, cookiesFromBrowser: "app" }],
    ["/api/comments", { url: S.YT, cookiesFromBrowser: "app" }],
    ["/api/auth/youtube/status", { browser: "app" }],
    ["/api/download", { url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 0, end: 2 }] }],
    ["/api/download best (session probe)", { url: S.YT, cookiesFromBrowser: "app", quality: "best", deliver: "path", segments: [{ start: 0, end: 2 }] }],
  ];
  const provenance = [];
  for (const [label, body] of probes) {
    s.resetLogs();
    const route = label.split(" ")[0];
    const r = await s.json("POST", route, body);
    const runs = s.argvLog().filter((x) => !x.argv.includes("--version"));
    const cookiePaths = runs.map((x) => {
      const i = x.argv.indexOf("--cookies");
      return i >= 0 ? x.argv[i + 1] : null;
    });
    const row = {
      endpoint: label, status: r.status, runs: runs.length,
      cookiePaths,
      handedCanonical: cookiePaths.filter((p) => p === JAR()).length,
      handedPrivateCopy: cookiePaths.filter((p) => p && p !== JAR()).length,
      noCookieFlag: cookiePaths.filter((p) => p === null).length,
    };
    provenance.push(row);
    console.log(`  ${label.padEnd(36)} status=${String(row.status).padEnd(4)} runs=${row.runs} canonical=${row.handedCanonical} privateCopy=${row.handedPrivateCopy} none=${row.noCookieFlag}`);
    if (row.handedCanonical) console.log(`      !!! canonical jar handed straight to yt-dlp: ${JAR()}`);
  }
  await s.stop();

  // ---- 2. One run's write-back, per endpoint ----------------------------
  console.log("\n\n=== 2. ONE RUN, WITH yt-dlp's REAL WRITE-BACK BEHAVIOUR ===");
  for (const [label, body] of probes) {
    writeJar("original");
    S.setStub(stub, {
      info: { id: "stub0000001", title: "Stub", duration: 30 },
      cookieWriteBack: GOOD("refreshed-by-%PID%"),
    });
    s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
    const before = jarState();
    const route = label.split(" ")[0];
    const r = await s.json("POST", route, body);
    await new Promise((x) => setTimeout(x, 600));
    report(`one run: ${label}`, before, jarState(), {
      status: r.status,
      childWrites: s.cookieLog().length,
      childWroteTo: s.cookieLog().map((x) => x.file),
    });
    await s.stop();
  }

  // ---- 3. TWO CONCURRENT RUNS on the same jar --------------------------
  console.log("\n\n=== 3. TWO CONCURRENT RUNS ON THE SAME COOKIE FILE ===");
  const pairs = [
    ["info + info", "/api/info", { url: S.YT, cookiesFromBrowser: "app" }, "/api/info", { url: S.YT, cookiesFromBrowser: "app" }],
    ["info + transcript", "/api/info", { url: S.YT, cookiesFromBrowser: "app" }, "/api/transcript", { url: S.YT, cookiesFromBrowser: "app" }],
    ["info + download", "/api/info", { url: S.YT, cookiesFromBrowser: "app" },
      "/api/download", { url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 0, end: 2 }] }],
    ["download + download", "/api/download", { url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 0, end: 2 }] },
      "/api/download", { url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 3, end: 5 }] }],
    ["auth status + auth status", "/api/auth/youtube/status", { browser: "app" }, "/api/auth/youtube/status", { browser: "app" }],
  ];
  for (const [label, r1, b1, r2, b2] of pairs) {
    writeJar("original");
    // A slow, half-written save: exactly the interleave the module header warns
    // about. 400ms is long enough for the other run to read a torn file.
    S.setStub(stub, {
      info: { id: "stub0000001", title: "Stub", duration: 30 },
      delayMs: 150,
      cookieWriteBack: GOOD("refreshed-by-%PID%"),
      cookieWriteDelayMs: 400,
    });
    s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
    const before = jarState();
    // Watch the jar while both runs are in flight.
    const samples = [];
    const watch = setInterval(() => samples.push({ t: Date.now(), ...jarState() }), 60);
    const a = s.open("POST", r1, { body: JSON.stringify(b1), headers: { "content-type": "application/json" } });
    const b = s.open("POST", r2, { body: JSON.stringify(b2), headers: { "content-type": "application/json" } });
    const [ra, rb] = [await a.wait(120000), await b.wait(120000)];
    await new Promise((x) => setTimeout(x, 800));
    clearInterval(watch);
    const torn = samples.filter((x) => !x.signedIn);
    report(`concurrent: ${label}`, before, jarState(), {
      statuses: [ra && ra.status, rb && rb.status],
      childWrites: s.cookieLog().length,
      childWroteTo: [...new Set(s.cookieLog().map((x) => x.file))],
      canonicalWrites: s.cookieLog().filter((x) => x.file === JAR()).length,
      samplesTaken: samples.length,
      samplesWithNoSignIn: torn.length,
      tornExample: torn[0] ? JSON.stringify(torn[0]) : null,
      distinctSidsSeen: [...new Set(samples.map((x) => x.sid))],
    });
    await s.stop();
  }

  // ---- 4. A failed run must not promote its jar ------------------------
  console.log("\n\n=== 4. A FAILED RUN'S WRITE-BACK ===");
  writeJar("original");
  S.setStub(stub, { exitCode: 1, stderr: "ERROR: Sign in to confirm you're not a bot", cookieWriteBack: GOOD("written-by-a-failed-run") });
  s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
  let before = jarState();
  let r = await s.json("POST", "/api/info", { url: S.YT, cookiesFromBrowser: "app" });
  await new Promise((x) => setTimeout(x, 400));
  report("failed /api/info run write-back", before, jarState(), { status: r.status, body: (r.body || "").slice(0, 200) });
  await s.stop();

  // ---- 5. yt-dlp writes GARBAGE back (expired/empty jar) --------------
  console.log("\n\n=== 5. A RUN THAT WRITES A SIGNED-OUT JAR BACK ===");
  for (const [label, writeBack] of [
    ["empty file", ""],
    ["header only, no cookies", "# Netscape HTTP Cookie File\n"],
    ["cookies but no SID", "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t9999999999\tPREF\tx\n"],
  ]) {
    writeJar("original");
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, cookieWriteBack: writeBack || " " });
    s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
    before = jarState();
    r = await s.json("POST", "/api/info", { url: S.YT, cookiesFromBrowser: "app" });
    await new Promise((x) => setTimeout(x, 400));
    report(`write-back is ${label} (via /api/info)`, before, jarState(), { status: r.status });
    await s.stop();

    writeJar("original");
    s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
    before = jarState();
    r = await s.json("POST", "/api/download", { url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 0, end: 2 }] });
    await new Promise((x) => setTimeout(x, 400));
    report(`write-back is ${label} (via /api/download)`, before, jarState(), { status: r.status });
    await s.stop();
  }

  // ---- 6. Jar deleted mid-run ------------------------------------------
  console.log("\n\n=== 6. THE JAR IS DELETED WHILE A RUN IS IN FLIGHT ===");
  writeJar("original");
  S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 }, delayMs: 1200, cookieWriteBack: GOOD("refreshed") });
  s = await S.start({ stub, env: { YT_CLIPPER_COOKIE_FILE: JAR() } });
  before = jarState();
  const dl = s.open("POST", "/api/download", {
    body: JSON.stringify({ url: S.YT, cookiesFromBrowser: "app", quality: "360", deliver: "path", segments: [{ start: 0, end: 2 }] }),
    headers: { "content-type": "application/json" },
  });
  await new Promise((x) => setTimeout(x, 500));
  fs.rmSync(JAR(), { force: true });
  const rr = await dl.wait(120000);
  report("jar deleted mid-download", before, jarState(), { status: rr && rr.status, body: (rr && rr.body || "").slice(0, 200) });
  await s.stop();

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ provenance, results }, null, 2));
  console.log("\n\n===== SUMMARY =====");
  console.log("  canonical jar handed directly to yt-dlp by:");
  for (const p of provenance) if (p.handedCanonical) console.log(`     ${p.endpoint}  (${p.handedCanonical} of ${p.runs} runs)`);
  console.log("  runs that LOST the sign-in:");
  for (const r of results) if (r.signInLost) console.log(`     ${r.name}`);
  console.log("  runs where a child OVERWROTE the canonical jar:");
  for (const r of results) if (r.overwritten) console.log(`     ${r.name}  sid ${r.before.sid} -> ${r.after.sid}`);
  console.log(`  results: ${path.join(OUT, "results.json")}`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
