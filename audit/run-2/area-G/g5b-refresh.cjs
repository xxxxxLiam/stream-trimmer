/**
 * File: g5b-refresh.cjs
 * Path: audit/run-2/area-G/g5b-refresh.cjs
 * Description: The other half of G-5's fix: the jar must still be REFRESHABLE.
 * A protection that never lets a good write-back through would let the saved
 * session expire with no way to renew it. Segment one of a download is the
 * only designated refresher, so:
 *   1  a successful download whose engine writes back a valid, newer jar ->
 *      the canonical jar must take the new value (committed).
 *   2  a FAILED download with the same write-back -> discarded.
 *   3  /api/info with a valid newer jar -> never promotes (by design).
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const G = require("./glib.cjs");

const GOOD_WRITE_BACK =
  "# Netscape HTTP Cookie File\n" +
  ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tREFRESHEDSIDVALUE999\n" +
  ".youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-3PSID\tREFRESHED3PSID999\n";

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 12);

async function main() {
  const out = { when: new Date().toISOString() };
  const jarDir = fs.mkdtempSync(path.join(os.tmpdir(), "g2jar2-"));
  const jar = path.join(jarDir, "yt-cookies.txt");
  G.writeCookieJar(jar);
  const s = await G.startServer({
    label: "refresh",
    cfg: {},
    cookieFile: jar,
  });

  const dl = (jobId, extra = {}) =>
    s.post(
      `/api/download?jobId=${jobId}`,
      {
        url: G.YT_URL,
        quality: "360",
        format: "mp4",
        deliver: "path",
        segments: [{ start: 0, end: 2 }],
        cookiesFromBrowser: "app",
        ...extra,
      },
      { timeout: 300_000 },
    );

  // 1. a successful download with a valid refreshed jar
  G.writeCookieJar(jar);
  s.configure({ duration: 30, cookieWriteBack: GOOD_WRITE_BACK });
  const before1 = { sha: sha(jar), bytes: fs.statSync(jar).size };
  const r1 = await dl("job_refresh_ok");
  await G.sleep(400);
  out.successfulDownload = {
    status: r1.status,
    before: before1,
    afterSha: sha(jar),
    afterBytes: fs.statSync(jar).size,
    tookTheRefreshedValue: fs.readFileSync(jar, "utf8").includes("REFRESHEDSIDVALUE999"),
  };

  // 2. a failed download with the same write-back
  G.writeCookieJar(jar);
  s.configure({ duration: 30, cookieWriteBack: GOOD_WRITE_BACK, failSections: true, failFull: true });
  const before2 = { sha: sha(jar), bytes: fs.statSync(jar).size };
  const r2 = await dl("job_refresh_fail");
  await G.sleep(400);
  out.failedDownload = {
    status: r2.status,
    before: before2,
    afterSha: sha(jar),
    afterBytes: fs.statSync(jar).size,
    tookTheRefreshedValue: fs.readFileSync(jar, "utf8").includes("REFRESHEDSIDVALUE999"),
  };

  // 3. /api/info with a valid newer jar
  G.writeCookieJar(jar);
  s.configure({ duration: 30, cookieWriteBack: GOOD_WRITE_BACK });
  const before3 = { sha: sha(jar) };
  const r3 = await s.post("/api/info", { url: G.YT_URL, cookiesFromBrowser: "app" });
  await G.sleep(300);
  out.infoRoute = {
    status: r3.status,
    before: before3,
    afterSha: sha(jar),
    tookTheRefreshedValue: fs.readFileSync(jar, "utf8").includes("REFRESHEDSIDVALUE999"),
  };

  out.cookieLog = s.log().split("\n").filter((l) => /cookie|jar/i.test(l));
  await s.stop();
  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g5b-refresh", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
