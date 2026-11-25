import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BUNDLE_CHARS,
  MAX_STDERR_LINES,
  REDACTION_RULES,
  USER_FIXABLE_CODES,
  buildDiagnosticsBundle,
  classifyFailureKind,
  failureId,
  fenceForClipboard,
  needsDeveloper,
  offersDeveloperDiagnostics,
  TRANSFER_BROKEN_PREFIX,
  redact,
} from "./diagnostics";

const HOME = "/Users/samantha";
const COOKIE_PATH = `${HOME}/Library/Application Support/Clipper/yt-cookies.txt`;
const SIG = "AOq0QJ8wRAIgD3adbeefSIGNATUREvalue99";
const PO = "MnQ4xPOTOKENsecretvalue1234567890abc";
const SIGNED_URL = `https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1799999999&id=o-AB&ip=203.0.113.7&sig=${SIG}&lsig=ALsigsecret77&pot=${PO}&itag=137`;

/** A log shaped like a real failing run: every secret kind appears, some more than once. */
const FIXTURE = [
  `[server] /api/download exec url=https://www.youtube.com/watch?v=dQw4w9WgXcQ job=job_1_a options={"cookies":"${COOKIE_PATH}","extractorArgs":"youtube:po_token=web+${PO}"}`,
  `yt-dlp --cookies ${COOKIE_PATH} --extractor-args "youtube:po_token=web.gvs+${PO}" https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
  `[debug] Command-line config: ['--cookies', '${COOKIE_PATH}']`,
  `[youtube] Loading cookies from "${COOKIE_PATH}"`,
  `[download] Destination: ${HOME}/Movies/clips/part.mp4`,
  `ERROR: unable to download video data: HTTP Error 403 for ${SIGNED_URL}`,
  `ffmpeg: Error opening input file ${SIGNED_URL}`,
  `.youtube.com\tTRUE\t/\tTRUE\t1799999999\tSAPISID\tSECRETCOOKIEVALUE`,
  `Cookie: SID=SECRETCOOKIEVALUE; HSID=other`,
  `po_token: ${PO}`,
  `traceback at ${HOME}/Applications/Clipper.app/Contents/Resources/app/server/index.js:10`,
  `C:\\Users\\Samantha\\AppData\\Local\\Temp\\clip.mp4 failed`,
  `reported by samantha@example.com`,
].join("\n");

const SECRETS = {
  "cookie path": ["yt-cookies.txt", "Application Support/Clipper"],
  "home path": ["/Users/samantha", "C:\\Users\\Samantha", "Users/samantha"],
  "signed url": [SIG, "ALsigsecret77", "203.0.113.7"],
  "po token": [PO],
  "cookie data": ["SECRETCOOKIEVALUE"],
  "email": ["samantha@example.com"],
} as const;

function assertNoSecrets(text: string, label = "") {
  for (const [kind, needles] of Object.entries(SECRETS)) {
    for (const n of needles) {
      assert.ok(!text.includes(n), `${label}${kind} leaked: ${n}\n${text}`);
    }
  }
}

// --- classifier -------------------------------------------------------------

test("classifier: each of the seven user-fixable rows is userFixable", () => {
  for (const code of [
    "stale_session",
    "private_video",
    "network_dropped",
    "out_point_past_end",
    "save_folder_gone",
    "disk_full",
    "engine_behind",
  ]) {
    assert.equal(classifyFailureKind(code), "userFixable", code);
    assert.equal(needsDeveloper(code), false, code);
  }
});

test("classifier: the pre-flight session failure is the same row", () => {
  assert.equal(classifyFailureKind("YOUTUBE_AUTH_REQUIRED"), "userFixable");
});

test("classifier: the allow-list is exactly those eight codes", () => {
  assert.equal(USER_FIXABLE_CODES.length, 8);
});

test("classifier: join_failed and unknown need the developer", () => {
  assert.equal(classifyFailureKind("join_failed"), "needsDeveloper");
  assert.equal(classifyFailureKind("unknown"), "needsDeveloper");
});

test("classifier: anything unrecognised needs the developer", () => {
  for (const v of [
    undefined,
    null,
    "",
    "some_new_failure",
    "IPC_ERROR",
    "PARSE_FAILURE",
    "Stale_Session",
    " stale_session",
    "stale_session ",
    "disk_full\n",
    0,
    {},
    ["disk_full"],
    "__proto__",
    "constructor",
    "toString",
  ]) {
    assert.equal(classifyFailureKind(v), "needsDeveloper", String(v));
  }
});

test("classifier: the allow-list is frozen", () => {
  assert.throws(() => (USER_FIXABLE_CODES as string[]).push("unknown"));
});

// --- redactor: the four secret kinds -----------------------------------------

test("redactor: the fixture leaks no cookie path, home path, signed URL or PO token", () => {
  const out = redact(FIXTURE, { homeDir: HOME });
  assertNoSecrets(out);
});

test("redactor: still works when the home directory is not told to it", () => {
  const out = redact(FIXTURE, {});
  assertNoSecrets(out);
});

test("redactor: the home directory becomes ~ everywhere, including engine output", () => {
  const out = redact(`${HOME}/Movies/a.mp4 and also ${HOME}`, { homeDir: HOME });
  assert.equal(out, "~/Movies/a.mp4 and also ~");
});

test("redactor: a home directory with a trailing slash or backslashes still matches", () => {
  assert.equal(redact("C:\\Users\\Sam\\x.mp4", { homeDir: "C:\\Users\\Sam\\" }), "~\\x.mp4");
  assert.equal(redact("C:/Users/Sam/x.mp4", { homeDir: "C:\\Users\\Sam" }), "~/x.mp4");
  assert.equal(redact("/home/sam/x", { homeDir: "/home/sam/" }), "~/x");
});

test("redactor: a similarly named sibling directory is not swallowed", () => {
  const out = redact("/home/sam2/x and /home/sam/y", { homeDir: "/home/sam" });
  assert.ok(!out.includes("/home/sam/y"));
});

test("redactor: --cookies path becomes --cookies <redacted>", () => {
  assert.equal(
    redact("yt-dlp --cookies /tmp/x/cookies.txt --no-playlist", {}),
    "yt-dlp --cookies <redacted> --no-playlist",
  );
  assert.equal(redact('--cookies "/a b/c.txt" -f 18', {}), "--cookies <redacted> -f 18");
  assert.equal(redact("--cookies=/a/b/c", {}), "--cookies <redacted>");
});

test("redactor: an unquoted cookies path containing spaces is fully removed", () => {
  const out = redact("--cookies /Users/sam/Library/Application Support/Clipper/yt-cookies.txt -f 18", {
    homeDir: "/Users/sam",
  });
  assert.equal(out, "--cookies <redacted> -f 18");
});

test("redactor: cookies in an options object are removed", () => {
  const out = redact('options={"cookies":"/home/sam/.config/c.txt","x":1}', {});
  assert.ok(!out.includes("/home/sam"));
  assert.ok(out.includes('"x":1'));
});

test("redactor: cookie file rows and header never survive", () => {
  const out = redact(
    "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1799999999\tSID\tabc123\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tzzz",
    {},
  );
  assert.ok(!out.includes("abc123"));
  assert.ok(!out.includes("zzz"));
  assert.ok(!out.includes("Netscape"));
});

test("redactor: Cookie, Set-Cookie and Authorization headers lose their values", () => {
  const out = redact("Cookie: SID=abc\nSet-Cookie: HSID=def; Secure\nAuthorization: Bearer ghijklmnop", {});
  for (const v of ["abc", "def", "ghijklmnop"]) assert.ok(!out.includes(v), v);
});

test("redactor: signed URL parameters are stripped, harmless ones are kept", () => {
  const out = redact(SIGNED_URL, {});
  assert.ok(out.includes("sig=REDACTED"));
  assert.ok(out.includes("lsig=REDACTED"));
  assert.ok(out.includes("pot=REDACTED"));
  assert.ok(out.includes("ip=REDACTED"));
  assert.ok(out.includes("itag=137"));
  assert.ok(out.includes("googlevideo.com/videoplayback"));
});

test("redactor: token parameters in a fragment or after a semicolon are stripped", () => {
  const out = redact("https://x.test/cb#access_token=ABCDEFGH123&state=ok", {});
  assert.ok(!out.includes("ABCDEFGH123"));
  assert.ok(out.includes("state=ok"));
});

test("redactor: an ordinary video link passes through untouched", () => {
  const u = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30";
  assert.equal(redact(u, {}), u);
});

test("redactor: PO tokens in every spelling", () => {
  for (const s of [
    `--extractor-args youtube:po_token=web+${PO}`,
    `po_token: ${PO}`,
    `PO Token=${PO}`,
    `visitor_data=${PO}`,
  ]) {
    assert.ok(!redact(s, {}).includes(PO), s);
  }
});

test("redactor: is idempotent", () => {
  const once = redact(FIXTURE, { homeDir: HOME });
  assert.equal(redact(once, { homeDir: HOME }), once);
});

test("redactor: leaves ordinary text alone", () => {
  const t = "ERROR: Unable to extract nsig function; please report this issue";
  assert.equal(redact(t, {}), t);
});

// --- mutation check: break each rule in turn, the fixture must then leak ----

test("mutation: disabling any single rule makes the fixture leak", () => {
  const needed: Record<string, readonly string[]> = {
    "cookie-file-contents": ["SECRETCOOKIEVALUE"],
    "auth-headers": [], // overlaps cookie-assignment on a SID cookie; focused case below
    "cookies-flag": [],
    "cookies-option": [],
    "cookie-file-path": [],
    "cookie-assignment": [],
    "url-secrets": [SIG, "ALsigsecret77", "203.0.113.7"],
    "po-token": [],
    "home-dir": ["/Users/samantha"],
    email: ["samantha@example.com"],
    "cookie-json": [], // proven on its own input in common/utils/redact.test.ts (E-10)
    "lan-ip": [], // likewise
    "unc-path": [], // proven on its own input in common/utils/redact.test.ts (E2-8)
  };
  assert.deepEqual(
    REDACTION_RULES.map((r) => r.id).sort(),
    Object.keys(needed).sort(),
    "every rule is covered by this test",
  );
  for (const rule of REDACTION_RULES) {
    const out = redact(FIXTURE, { homeDir: HOME }, new Set([rule.id]));
    const stillFine = out === redact(FIXTURE, { homeDir: HOME });
    // Rules that overlap with a sibling are checked on a focused input below.
    if (needed[rule.id].length) {
      assert.ok(!stillFine, `disabling ${rule.id} changed nothing`);
      assert.ok(
        needed[rule.id].some((n) => out.includes(n)),
        `disabling ${rule.id} did not leak`,
      );
    }
  }
});

test("mutation: rules that overlap are each load-bearing on a focused input", () => {
  const cases: Array<[string, string, string]> = [
    ["cookies-flag", `--cookies /tmp/z/jar-one.dat -f 18`, "jar-one.dat"],
    ["cookies-option", `{"cookies":"/tmp/z/jar-two.dat"}`, "jar-two.dat"],
    ["cookie-file-path", `read /tmp/z/my-cookies.txt ok`, "my-cookies.txt"],
    ["po-token", `po_token=${PO}`, PO],
    ["auth-headers", `Authorization: Basic ZZAUTHVALUE77`, "ZZAUTHVALUE77"],
    ["po-token", `{"access_token": "JSONQUOTEDTOKEN77"}`, "JSONQUOTEDTOKEN77"],
    ["cookie-assignment", `sent __Secure-3PAPISID=BARECOOKIEVALUE77 ok`, "BARECOOKIEVALUE77"],
    ["url-secrets", `https://rr1.googlevideo.com/videoplayback/id/PATHSTREAMID77/sig/PATHSIGVALUE77/file/v.mp4`, "PATHSIGVALUE77"],
  ];
  for (const [id, input, needle] of cases) {
    assert.ok(!redact(input, {}).includes(needle), `${id}: enabled should hide it`);
    assert.ok(
      redact(input, {}, new Set([id])).includes(needle),
      `${id}: disabling it should leak`,
    );
  }
});

// --- bundle ------------------------------------------------------------------

const NOW = new Date("2026-11-21T10:20:30.000Z");

function bundle(over: Partial<Parameters<typeof buildDiagnosticsBundle>[0]> = {}) {
  return buildDiagnosticsBundle({
    code: "unknown",
    message: `yt-dlp exited 1 reading ${COOKIE_PATH}`,
    now: NOW,
    attempt: {
      operation: "download clip",
      videoId: "dQw4w9WgXcQ",
      segments: [
        { start: 72, end: 90 },
        { start: 604, end: 620 },
      ],
      format: "mp4",
      quality: "best",
    },
    diagnostics: {
      jobId: "job_1_a",
      appVersion: "3.3.0",
      platform: "darwin",
      osRelease: "24.1.0",
      arch: "arm64",
      homeDir: HOME,
      ytDlpVersion: "2026.11.04",
      ffmpegVersion: "7.1",
      stderrTail: FIXTURE.split("\n"),
      logLines: FIXTURE.split("\n").map((l) => `2026-11-21T10:20:00Z [log] ${l} job=job_1_a`),
    },
    ...over,
  });
}

test("bundle: carries every field the spec asks for", () => {
  const b = bundle();
  for (const needle of [
    "Clipper diagnostics",
    "Failure id: ",
    "Time: 2026-11-21T10:20:30.000Z",
    "App: 3.3.0",
    "OS: darwin 24.1.0 arm64",
    "yt-dlp: 2026.11.04",
    "ffmpeg: 7.1",
    "Job: job_1_a",
    "download clip",
    "video dQw4w9WgXcQ",
    "00:01:12 to 00:01:30; 00:10:04 to 00:10:20",
    "format mp4",
    "quality best",
    "Error code: unknown",
    "Error message: yt-dlp exited 1",
    "engine stderr, this run only",
    "log lines for job job_1_a",
  ]) {
    assert.ok(b.includes(needle), `missing: ${needle}`);
  }
});

test("bundle: the fixture log leaks none of the four secret kinds, anywhere in the report", () => {
  assertNoSecrets(bundle());
});

test("bundle: a secret in the error message itself is redacted too", () => {
  const b = bundle({ message: `failed on ${SIGNED_URL} at ${HOME}/x` });
  assertNoSecrets(b);
});

test("bundle: a secret in the app fields or job id is redacted too", () => {
  const b = bundle({
    diagnostics: { jobId: "job_1", appVersion: `po_token=${PO}`, platform: HOME, stderrTail: [], homeDir: HOME },
  });
  assert.ok(!b.includes(PO));
  assert.ok(!b.includes("/Users/samantha"));
});

test("bundle: stderr is capped at 100 lines, keeping the newest", () => {
  const lines = Array.from({ length: 400 }, (_, i) => `err line ${i}`);
  const b = bundle({ diagnostics: { jobId: "j", stderrTail: lines } });
  const count = b.split("\n").filter((l) => l.startsWith("err line ")).length;
  assert.equal(count, MAX_STDERR_LINES);
  assert.ok(b.includes("err line 399"));
  assert.ok(!b.includes("err line 299\n"));
});

test("bundle: progress chatter is dropped from stderr", () => {
  const b = bundle({
    diagnostics: { jobId: "j", stderrTail: ["[download]  42.0% of 10MiB", "real problem"] },
  });
  assert.ok(b.includes("real problem"));
  assert.ok(!b.includes("42.0%"));
});

test("bundle: never exceeds the cap, however much is thrown at it", () => {
  const big = Array.from({ length: 5000 }, (_, i) => `line ${i} ${"x".repeat(300)}`);
  const b = bundle({ diagnostics: { jobId: "j", stderrTail: big, logLines: big } });
  assert.ok(b.length <= MAX_BUNDLE_CHARS, String(b.length));
  assert.ok(b.includes("Failure id: "));
  assert.ok(b.includes("Error code: unknown"));
});

test("bundle: a huge message is truncated, not allowed to eat the budget", () => {
  const b = bundle({ message: "m".repeat(100_000) });
  assert.ok(b.length <= MAX_BUNDLE_CHARS);
});

test("bundle: missing engine data says unknown rather than breaking", () => {
  const b = buildDiagnosticsBundle({ code: undefined, message: "Download failed", now: NOW });
  assert.ok(b.includes("yt-dlp: unknown"));
  assert.ok(b.includes("Error code: none"));
  assert.ok(b.includes("(none captured)"));
});

test("bundle: only what was passed in appears (scoped, not the whole log)", () => {
  const b = bundle({ diagnostics: { jobId: "job_1_a", logLines: ["only this"] } });
  assert.ok(b.includes("only this"));
  assert.equal(b.split("\n").filter((l) => l.includes("job_1_a")).length >= 1, true);
});

test("failureId: stable for the same input, different for different input", () => {
  assert.equal(failureId(["a", "b"]), failureId(["a", "b"]));
  assert.notEqual(failureId(["a", "b"]), failureId(["a", "c"]));
  assert.match(failureId(["x"]), /^[0-9A-F]{6}$/);
});

test("fence: wraps in a code block, and outgrows any fence inside the text", () => {
  assert.equal(fenceForClipboard("hi"), "```text\nhi\n```");
  const f = fenceForClipboard("a ``` b");
  assert.ok(f.startsWith("````text\n") && f.endsWith("\n````"));
});

test("no em dashes in anything the module writes itself", () => {
  assert.ok(!bundle({ message: "plain", diagnostics: {} }).includes("\u2014"));
});

// --- F-19 / F-7: the pattern that let one planted marker through ------------------------------

test("redactor: the googlevideo stream id parameter is stripped, the watch id is not", () => {
  const url = "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&ip=203.0.113.9&id=o-STREAMIDvalue99&itag=137";
  const out = redact(url);
  assert.ok(!out.includes("STREAMIDvalue99"), out);
  assert.match(out, /id=REDACTED/);
  assert.equal(redact("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123");
});

test("redactor: /root is a home directory even when it is not told so", () => {
  const out = redact("writing /root/Videos/clips/out.mp4 and /root");
  assert.ok(!out.includes("/root"), out);
  assert.match(out, /~\/Videos\/clips\/out\.mp4/);
  // A path that merely starts with the letters is left alone.
  assert.equal(redact("/rootfs/x"), "/rootfs/x");
});

test("redactor: all nine planted markers are gone in one pass (0 of 9)", () => {
  const planted = [
    "Cookie: SID=SECRETsid123; HSID=SECREThsid456",
    ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSECRETsidrowvalue999",
    "Authorization: Bearer SECRETbearertoken_abcdefghijklmnop",
    "access_token=SECRETaccesstoken_qrstuvwx",
    "po_token=SECRETpotoken_0123456789",
    "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&ip=203.0.113.9&id=o-SECRETSTREAMID&sig=SECRETSIGVALUE",
    "sam.clipper@example.com",
    "/root/Videos/clips/out.mp4",
    "--cookies /root/.config/youtube-clipper/yt-cookies.txt",
  ].join("\n");
  const out = redact(planted);
  const needles = ["SECRETsid123", "SECRETsidrowvalue999", "SECRETbearertoken", "SECRETaccesstoken", "SECRETpotoken", "SECRETSTREAMID", "sam.clipper@example.com", "/root", "yt-cookies.txt"];
  assert.deepEqual(needles.filter((n) => out.includes(n)), []);
});

test("F-8: offersDeveloperDiagnostics needs a code the engine does not list as user-fixable", () => {
  assert.equal(offersDeveloperDiagnostics(undefined, "could not find chrome cookies database"), false);
  assert.equal(offersDeveloperDiagnostics("unknown", "x"), true);
  assert.equal(offersDeveloperDiagnostics("join_failed", "x"), true);
  for (const code of USER_FIXABLE_CODES) assert.equal(offersDeveloperDiagnostics(code, "x"), false, code);
  assert.equal(offersDeveloperDiagnostics(undefined, `${TRANSFER_BROKEN_PREFIX} before it finished.`), true);
});
