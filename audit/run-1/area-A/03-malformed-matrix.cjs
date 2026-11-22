/**
 * A-03: every way a cookies.txt can be wrong, through BOTH import routes:
 *   - the file picker  (youtube:importCookies -> importCookieFile)
 *   - dropped text     (youtube:importCookiesText -> importCookieText)
 * Records the verbatim IPC return, what landed on disk, and the probe verdict
 * afterwards. The app starts each case already signed in with a known-good
 * file, so "did a bad import destroy the good session?" is answerable.
 */
const fs = require("node:fs");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const TAB = "\t";
const row = (d, exp, n, v) => [d, "TRUE", "/", "TRUE", exp, n, v].join(TAB);
const HEADER = "# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n\n";

const cases = [
  ["empty file", ""],
  ["whitespace only", "   \n\t\n  "],
  ["header only", HEADER],
  ["wrong column count (5)", HEADER + ".youtube.com\tTRUE\t/\tTRUE\tSID"],
  ["8 columns, tab inside value", HEADER + ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tval\tue"],
  ["space separated not tabs", HEADER + ".youtube.com TRUE / TRUE 2000000000 SID abc123"],
  ["expires in the past", HEADER + row(".youtube.com", "1000000000", "SID", "pastvalue1234")],
  ["expires 0 (session cookie)", HEADER + row(".youtube.com", "0", "SID", "sessionvalue1")],
  ["expires -1", HEADER + row(".youtube.com", "-1", "SID", "negvalue12345")],
  ["expires 99999999999999 (huge)", HEADER + row(".youtube.com", "99999999999999", "SID", "hugevalue1234")],
  ["expires 1e309 (Infinity)", HEADER + row(".youtube.com", "1e309", "SID", "infvalue12345")],
  ["expires 1800000000.75 (decimal)", HEADER + row(".youtube.com", "1800000000.75", "SID", "decvalue12345")],
  ["expires not a number", HEADER + row(".youtube.com", "never", "SID", "nanvalue12345")],
  ["unicode + emoji value", HEADER + row(".youtube.com", "2000000000", "SID", "ünïcødé-🍪-값-значение")],
  ["CRLF line endings", HEADER.replace(/\n/g, "\r\n") + row(".youtube.com", "2000000000", "SID", "crlfvalue1234") + "\r\n"],
  ["wrong domain (notyoutube.com)", HEADER + row(".notyoutube.com", "2000000000", "SID", "wrongdomain12")],
  ["wrong domain (vimeo.com)", HEADER + row(".vimeo.com", "2000000000", "SID", "vimeovalue123")],
  ["google.com only", HEADER + row(".google.com", "2000000000", "SID", "googlevalue12")],
  ["youtube cookies, no sign-in", HEADER + row(".youtube.com", "2000000000", "PREF", "f6=40000000")],
  ["SID present but empty value", HEADER + ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\t"],
  ["JSON export", '[{"domain":".youtube.com","name":"SID","value":"abc"}]'],
  ["HTML error page", "<!DOCTYPE html>\n<html><body>Not found</body></html>"],
  ["#HttpOnly_ rows only", HEADER + "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tg.a000httponly"],
  ["null bytes in value", HEADER + row(".youtube.com", "2000000000", "SID", "abc\u0000def\u0000ghi")],
];

(async () => {
  const good = L.goodCookies();
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });

  const a = await launchApp({ label: "A-03-matrix", cwd: L.STUB, outDir: `${L.OUT}/A-03` });
  const cookieFile = L.cookieFileOf(a);
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(2500);

    const results = [];
    for (const [name, text] of cases) {
      for (const route of ["text", "picker"]) {
        // start each case from a known-good session on disk
        fs.writeFileSync(cookieFile, good, { mode: 0o600 });
        let ret;
        if (route === "text") {
          ret = await L.ipc(a.win, "youtube:importCookiesText", text);
        } else {
          const p = L.writeFixture(`case-${results.length}.txt`, text);
          await L.stubPicker(a.app, [p]);
          ret = await L.ipc(a.win, "youtube:importCookies");
        }
        const onDisk = fs.existsSync(cookieFile) ? fs.readFileSync(cookieFile, "utf8") : null;
        const probe = await L.ipc(a.win, "youtube:probe");
        results.push({
          case: name,
          route,
          ok: ret.ok,
          kind: ret.kind,
          count: ret.count,
          error: ret.error,
          goodSessionSurvived: onDisk === good,
          onDiskIsCase: onDisk === text,
          probeConnected: probe.connected,
          probeExpiresAt: probe.expiresAt,
          probeExpired: probe.expired,
        });
      }
    }

    console.log("CASE".padEnd(34), "ROUTE".padEnd(7), "OK".padEnd(6), "KIND".padEnd(20), "ERROR");
    for (const r of results) {
      console.log(
        r.case.padEnd(34),
        r.route.padEnd(7),
        String(r.ok).padEnd(6),
        String(r.kind ?? "-").padEnd(20),
        (r.error ?? "").slice(0, 90),
      );
    }
    console.log("\n--- accepted files, and what the probe then says ---");
    for (const r of results.filter((x) => x.ok)) {
      console.log(
        r.case.padEnd(34),
        r.route.padEnd(7),
        "count=" + r.count,
        "connected=" + r.probeConnected,
        "expired=" + r.probeExpired,
        "expiresAt=" + r.probeExpiresAt,
        "asDate=" + (r.probeExpiresAt ? new Date(r.probeExpiresAt).toString().slice(0, 33) : "-"),
      );
    }
    console.log("\n--- cases where a REJECTED import still disturbed the good session ---");
    for (const r of results.filter((x) => !x.ok && !x.goodSessionSurvived)) {
      console.log(r.case, r.route, "-> good session gone");
    }
    fs.writeFileSync(`${L.OUT}/A-03/matrix.json`, JSON.stringify(results, null, 2));
    console.log("\nwrote", `${L.OUT}/A-03/matrix.json`);
  } finally {
    await a.close();
  }
})();
