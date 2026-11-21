/**
 * F-07: Copy diagnostics.
 *  - does it appear ONLY next to code-level errors, never next to ordinary
 *    user errors (bad URL, missing folder, disk full, dropped network)?
 *  - does it copy THAT failure's lines rather than the whole log?
 *  - does the clipboard text leak cookie values, tokens or the user's home path?
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

// Secrets planted in the engine's stderr. Every one of these strings must be
// absent from the clipboard.
const SECRETS = {
  cookieHeader: "Cookie: SID=SECRETsid123; HSID=SECREThsid456; LOGIN_INFO=SECRETlogin789",
  cookieRow: ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSECRETsidrowvalue999",
  bearer: "Authorization: Bearer SECRETbearertoken_abcdefghijklmnop",
  accessToken: "access_token=SECRETaccesstoken_qrstuvwx",
  poToken: "po_token=SECRETpotoken_0123456789",
  visitorData: "visitor_data=SECRETvisitordata_zzz",
  signedUrl:
    "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&ei=X&ip=203.0.113.9&id=o-SECRETID&sig=SECRETSIGVALUE&n=SECRETNPARAM",
  email: "sam.clipper@example.com",
};

function stderrWith(extra) {
  return [
    "[debug] Command-line config: ['--cookies', '/root/.config/youtube-clipper/yt-cookies.txt', '-f', 'bv*+ba']",
    `[debug] Loading cookies from /root/.config/youtube-clipper/yt-cookies.txt`,
    "# Netscape HTTP Cookie File",
    SECRETS.cookieRow,
    SECRETS.cookieHeader,
    SECRETS.bearer,
    `[debug] url ${SECRETS.signedUrl}`,
    `[debug] ${SECRETS.accessToken} ${SECRETS.poToken} ${SECRETS.visitorData}`,
    `[debug] account ${SECRETS.email}`,
    "[debug] writing to /root/Videos/clips/out.mp4",
    extra,
  ].join("\n");
}

const SHORT = { id: "stub0000001", title: "Stub video", duration: 60, uploader: "Stub channel" };

const UI = () => {
  const d = document;
  const btn = [...d.querySelectorAll("button")].find((b) => /Copy diagnostics|^Copied$/.test(b.textContent.trim()));
  const alerts = [...d.querySelectorAll('[role="alert"]')].map((a) => a.textContent.trim().slice(0, 220));
  return {
    copyButton: Boolean(btn),
    copyButtonLabel: btn ? btn.textContent.trim() : null,
    alerts,
  };
};

/** Re-opens the URL input (the chip replaces it once a video is loaded). */
async function setUrl(a, url) {
  await a.win.evaluate(() => {
    if (!document.querySelector("#ui-source-chip input")) {
      [...document.querySelectorAll("#ui-source-chip button")].find((b) => /Change/.test(b.textContent))?.click();
    }
  });
  await a.win.waitForTimeout(300);
  await a.win.locator("#ui-source-chip input").fill(url);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(5000);
}

async function loadVideo(a) {
  await setUrl(a, "https://www.youtube.com/watch?v=stub0000001");
}

/** Mark a short range and press the real Cut button. */
async function cut(a) {
  await a.win.locator("#ui-mark-in").fill("00:00:02");
  await a.win.locator("#ui-mark-out").fill("00:00:08");
  await a.win.waitForTimeout(500);
  const disabled = await a.win.evaluate(() => document.getElementById("ui-cut")?.disabled);
  if (disabled) console.log("  !! cut button disabled");
  await a.win.click("#ui-cut", { timeout: 5000 }).catch((e) => console.log("  !! cut click failed", String(e).split("\n")[0]));
  await a.win.waitForTimeout(6000);
}

(async () => {
  const rows = [];
  L.stub({ exitCode: 0, writeMedia: false, authStderr: null, info: SHORT });
  const a = await L.boot("F-07-diagnostics", { noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.context?.grantPermissions?.(["clipboard-read", "clipboard-write"]).catch(() => {});
    await loadVideo(a);
    await a.shot("video-loaded");

    const CASES = [
      // [name, stderr tail that drives the classifier, expectedKind]
      [
        "user: save folder gone",
        stderrWith("ERROR: unable to open for writing: [Errno 2] No such file or directory: '/root/gone/out.mp4'"),
        "userFixable",
      ],
      ["user: disk full", stderrWith("ERROR: [Errno 28] No space left on device"), "userFixable"],
      [
        "user: network dropped",
        stderrWith("ERROR: unable to download video data: <urlopen error [Errno 104] Connection reset by peer>"),
        "userFixable",
      ],
      [
        "user: private video",
        stderrWith("ERROR: [youtube] abc: Private video. Sign in if you've been granted access to this video"),
        "userFixable",
      ],
      [
        "dev: unknown engine crash",
        stderrWith("ERROR: Traceback (most recent call last): TypeError: NoneType object is not subscriptable"),
        "needsDeveloper",
      ],
    ];

    for (const [name, stderr, kind] of CASES) {
      L.stub({ exitCode: 1, stderr, authStderr: null, writeMedia: false, info: SHORT });
      await cut(a);
      const ui = await a.win.evaluate(UI);
      rows.push({ case: name, expected: kind, ...ui });
      console.log(
        `${name.padEnd(28)} expected=${kind.padEnd(14)} copyButton=${ui.copyButton}  alert="${(ui.alerts[0] || "").slice(0, 90)}"`,
      );
      await a.shot(`case-${name.replace(/\W+/g, "-")}`);
    }

    // ---- bad URL: an ordinary user error, must have no Copy diagnostics ----
    await setUrl(a, "not a youtube link at all");
    const badUrl = await a.win.evaluate(UI);
    rows.push({ case: "user: bad URL", expected: "userFixable", ...badUrl });
    console.log(`${"user: bad URL".padEnd(28)} copyButton=${badUrl.copyButton} alerts=${JSON.stringify(badUrl.alerts)}`);
    await a.shot("case-bad-url");

    // ---- a code-level /api/info failure: is Copy diagnostics offered? ----
    L.stub({ exitCode: 1, stderr: stderrWith("ERROR: Traceback: KeyError: 'streamingData'"), authStderr: null, info: SHORT });
    await setUrl(a, "https://www.youtube.com/watch?v=stub0000002");
    const infoFail = await a.win.evaluate(UI);
    const statusText = await a.win.evaluate(() =>
      [...document.querySelectorAll('[role="alert"],[role="status"]')].map((n) => n.textContent.trim().slice(0, 160)),
    );
    rows.push({ case: "dev: /api/info crash", expected: "needsDeveloper", ...infoFail, statusText });
    console.log(`${"dev: /api/info crash".padEnd(28)} copyButton=${infoFail.copyButton} text=${JSON.stringify(statusText)}`);
    await a.shot("case-info-crash");

    // ---- now actually COPY a developer failure and read the clipboard ----
    L.stub({ exitCode: 0, writeMedia: false, authStderr: null, info: SHORT });
    await setUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    L.stub({
      exitCode: 1,
      authStderr: null,
      stderr: stderrWith("ERROR: Traceback (most recent call last): TypeError: NoneType object is not subscriptable"),
      info: SHORT,
    });
    await cut(a);
    const beforeCopy = await a.win.evaluate(UI);
    console.log("dev failure, copy button present:", beforeCopy.copyButton);
    await a.win.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))?.click();
    });
    await a.win.waitForTimeout(1200);
    const clip = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    fs.writeFileSync(path.join(a.outDir, "clipboard-dev-failure.txt"), clip);
    const afterLabel = await a.win.evaluate(UI);
    console.log("button label after copy:", afterLabel.copyButtonLabel);
    await a.shot("after-copy-diagnostics");

    const leaks = Object.entries(SECRETS)
      .map(([k, v]) => {
        // check for the distinctive secret substring, not the whole line
        const needle = v.match(/SECRET[A-Za-z0-9_]+/)?.[0] ?? v;
        return [k, clip.includes(needle) ? needle : null];
      })
      .filter(([, v]) => v);
    const homeLeak = /\/root(?![\w-])/.test(clip);
    const result = {
      case: "clipboard contents",
      length: clip.length,
      firstLine: clip.split("\n")[1] ?? null,
      fenced: clip.startsWith("```"),
      hasFailureId: /Failure id: [0-9A-F]{6}/.test(clip),
      hasJobSection: /--- log lines for job /.test(clip),
      hasStderrSection: /--- engine stderr, this run only /.test(clip),
      leaks: Object.fromEntries(leaks),
      homePathLeak: homeLeak,
      containsCookieRemovedMarker: clip.includes("[cookie data removed]"),
      containsTilde: clip.includes("~"),
      // whole-log smell: does it carry lines from unrelated earlier jobs?
      mentionsOtherJobs: (clip.match(/job=/g) || []).length,
    };
    rows.push(result);
    console.log("CLIPBOARD CHECK:", JSON.stringify(result, null, 1));
    console.log("---- clipboard (first 2500 chars) ----");
    console.log(clip.slice(0, 2500));

    // ---- compare against the WHOLE log, which the other button copies ----
    await a.win.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Copy log")?.click();
    });
    const wholeLog = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    rows.push({ case: "whole-log button reachable from workspace", changed: wholeLog !== clip, len: wholeLog.length });
    console.log("whole-log copy reachable from workspace:", wholeLog !== clip, "len", wholeLog.length);
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "diagnostics.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
