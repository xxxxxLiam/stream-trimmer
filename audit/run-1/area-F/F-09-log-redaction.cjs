/**
 * F-09: the whole-log route. DiagnosticsDisclosure tells the user the log
 * records "no cookies, tokens or personal data". Produce a real failure whose
 * engine output carries a cookie row, a bearer token and the home path, then
 * read (a) the log file on disk, (b) what "Copy log" (diagnostics:copy) puts
 * on the clipboard, (c) what the in-app log viewer renders.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SIGNED_IN = "[debug] Extracted cookies from cookies file\n[debug] Found YouTube account cookies";
const SHORT = { id: "stub0000001", title: "Stub video", duration: 60, uploader: "Stub channel" };

const SECRETS = {
  cookieRow: ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSECRETsidrowvalue999",
  cookieHeader: "Cookie: SID=SECRETsid123; HSID=SECREThsid456",
  bearer: "Authorization: Bearer SECRETbearertoken_abcdefghijklmnop",
  accessToken: "access_token=SECRETaccesstoken_qrstuvwx",
  email: "sam.clipper@example.com",
  homePath: "/root/Videos/clips/SECRETFOLDER/out.mp4",
  sig: "sig=SECRETSIGVALUE",
};

const DL_STDERR = [
  "# Netscape HTTP Cookie File",
  SECRETS.cookieRow,
  SECRETS.cookieHeader,
  SECRETS.bearer,
  `[debug] ${SECRETS.accessToken}`,
  `[debug] url https://rr3---sn-abc.googlevideo.com/videoplayback?${SECRETS.sig}&n=SECRETN`,
  `[debug] user ${SECRETS.email}`,
  `[debug] writing ${SECRETS.homePath}`,
  "ERROR: Postprocessing: ffmpeg exited with code 234",
].join("\n");

(async () => {
  L.stub({ exitCode: 0, writeMedia: false, authStderr: SIGNED_IN, authExitCode: 1, info: SHORT });
  const a = await L.boot("F-09-log-redaction", { noStub: true });
  const logPath = path.join(a.userDataDir, "logs", "main.log");
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(5000);

    L.stub({
      exitCode: 0,
      authStderr: SIGNED_IN,
      authExitCode: 1,
      info: SHORT,
      writeMedia: false,
      downloadExitCode: 1,
      downloadStderr: DL_STDERR,
    });
    await a.win.locator("#ui-mark-in").fill("00:00:02");
    await a.win.locator("#ui-mark-out").fill("00:00:08");
    await a.win.waitForTimeout(400);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(9000);

    const onDisk = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "(no log file)";
    fs.writeFileSync(path.join(a.outDir, "main.log.copy"), onDisk);

    await a.win.evaluate(async () => {
      await window.electronAPI.copyDiagnostics();
    });
    await a.win.waitForTimeout(500);
    const clip = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    fs.writeFileSync(path.join(a.outDir, "copy-log-clipboard.txt"), clip);

    const check = (text, name) => {
      const hits = Object.entries(SECRETS)
        .map(([k, v]) => [k, v.match(/SECRET[A-Za-z0-9_]+/)?.[0] ?? v])
        .filter(([, n]) => text.includes(n))
        .map(([k, n]) => `${k}:${n}`);
      const extra = {
        emailPlain: text.includes(SECRETS.email),
        homeAbs: /\/root(?![\w-])/.test(text),
        cookiesFilePath: /yt-cookies\.txt/.test(text),
      };
      console.log(`\n${name}: length ${text.length}`);
      console.log("  secrets present:", JSON.stringify(hits));
      console.log("  ", JSON.stringify(extra));
      return { name, length: text.length, hits, ...extra };
    };

    const rows = [check(onDisk, "log file on disk"), check(clip, "diagnostics:copy clipboard (Copy log)")];

    // What the UI promises, verbatim, for comparison.
    const promise = await a.win.evaluate(() =>
      [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => /no\s*\n?\s*cookies, tokens or personal data/i.test(t || "")) ?? null,
    );
    console.log("\nUI promise text:", JSON.stringify(promise));
    rows.push({ name: "ui promise", promise });

    fs.writeFileSync(path.join(a.outDir, "log-redaction.json"), JSON.stringify(rows, null, 2));
    console.log("\nfirst 1400 chars of the log on disk:\n" + onDisk.slice(0, 1400));
    console.log("REPORT", path.join(a.outDir, "log-redaction.json"));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
