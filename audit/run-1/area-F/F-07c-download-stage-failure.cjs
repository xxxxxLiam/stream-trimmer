/**
 * F-07c: a failure in the DOWNLOAD stage (not the pre-flight probe) — the one
 * path that does attach per-run diagnostics. Copies the report through the
 * real button and checks it for leaks and for this-run-only scoping.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SIGNED_IN = "[debug] Extracted cookies from cookies file\n[debug] Found YouTube account cookies";
const SHORT = { id: "stub0000001", title: "Stub video", duration: 60, uploader: "Stub channel" };

const SECRETS = {
  cookieHeader: "Cookie: SID=SECRETsid123; HSID=SECREThsid456",
  cookieRow: ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSECRETsidrowvalue999",
  bearer: "Authorization: Bearer SECRETbearertoken_abcdefghijklmnop",
  accessToken: "access_token=SECRETaccesstoken_qrstuvwx",
  poToken: "po_token=SECRETpotoken_0123456789",
  signedUrl:
    "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&ei=X&ip=203.0.113.9&id=o-SECRETSTREAMID&sig=SECRETSIGVALUE&n=SECRETNPARAM&pot=SECRETPOT",
  email: "sam.clipper@example.com",
  homePath: "/root/Videos/clips/SECRETFOLDER/out.mp4",
};

const DL_STDERR = [
  "[debug] Command-line config: ['--cookies', '/root/.config/youtube-clipper/yt-cookies.txt']",
  "# Netscape HTTP Cookie File",
  SECRETS.cookieRow,
  SECRETS.cookieHeader,
  SECRETS.bearer,
  `[debug] fragment url ${SECRETS.signedUrl}`,
  `[debug] ${SECRETS.accessToken} ${SECRETS.poToken}`,
  `[debug] user ${SECRETS.email}`,
  `[debug] writing ${SECRETS.homePath}`,
  "[download]  12.3% of 10.00MiB at 1.00MiB/s ETA 00:01",
  "ERROR: Postprocessing: ffmpeg exited with code 234 - unexpected internal state",
].join("\n");

const UI = () => {
  const btn = [...document.querySelectorAll("button")].find((b) => /Copy diagnostics|^Copied$/.test(b.textContent.trim()));
  return {
    copyButton: Boolean(btn),
    label: btn?.textContent.trim() ?? null,
    alert: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim()).join(" || "),
  };
};

(async () => {
  L.stub({ exitCode: 0, writeMedia: false, authStderr: SIGNED_IN, authExitCode: 1, info: SHORT });
  const a = await L.boot("F-07c-download-stage", { noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(5000);

    // probe OK, download fails
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
    await a.win.waitForTimeout(500);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(9000);

    const ui = await a.win.evaluate(UI);
    console.log("copy button:", ui.copyButton);
    console.log("ON-SCREEN ALERT (first 1200 chars):\n", ui.alert.slice(0, 1200));
    fs.writeFileSync(path.join(a.outDir, "on-screen-alert.txt"), ui.alert);
    console.log("SHOT", await a.shot("download-stage-failure"));

    if (!ui.copyButton) throw new Error("no Copy diagnostics button on a download-stage failure");
    await a.win.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))?.click();
    });
    await a.win.waitForTimeout(1200);
    const clip = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    fs.writeFileSync(path.join(a.outDir, "clipboard.txt"), clip);
    console.log("SHOT", await a.shot("after-copy"));

    const needles = Object.fromEntries(
      Object.entries(SECRETS).map(([k, v]) => {
        const n = v.match(/SECRET[A-Za-z0-9_]+/)?.[0] ?? v;
        return [k, n];
      }),
    );
    const leaks = Object.entries(needles).filter(([, n]) => clip.includes(n));
    const summary = {
      length: clip.length,
      fenced: clip.startsWith("```"),
      app: (clip.match(/^App: .*$/m) || [])[0],
      os: (clip.match(/^OS: .*$/m) || [])[0],
      job: (clip.match(/^Job: .*$/m) || [])[0],
      ytdlp: (clip.match(/^yt-dlp: .*$/m) || [])[0],
      stderrSection: (clip.match(/^--- engine stderr.*$/m) || [])[0],
      logSection: (clip.match(/^--- log lines.*$/m) || [])[0],
      progressLineKept: /\[download\]\s+12\.3%/.test(clip),
      leaks: leaks.map(([k, n]) => `${k}:${n}`),
      homeAbsPathLeak: /\/root(?![\w-])/.test(clip),
      emailRedacted: clip.includes("<email>"),
      cookieMarker: clip.includes("[cookie data removed]"),
    };
    console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
    console.log("\n---- clipboard ----\n" + clip);
    fs.writeFileSync(path.join(a.outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
