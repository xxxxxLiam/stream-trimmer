/**
 * File: g7-urls.cjs
 * Path: audit/run-2/area-G/g7-urls.cjs
 * Description: Re-attacks the new host allowlist (run-1 G-3) with a fresh
 * hostile list — userinfo, unicode and punycode hosts, IP literals, suffix
 * tricks, youtu.be variants, and URL-PARSER DIFFERENTIALS between the
 * WHATWG parser the check uses (node:URL) and the RFC-3986 parser the engine
 * uses (Python's urllib, which is what yt-dlp parses URLs with).
 *
 * For each URL: the status, whether yt-dlp was spawned, the exact first argv
 * element the child saw, what node:URL thinks the host is, and what Python's
 * urlsplit thinks it is. A disagreement is the finding.
 */
const { spawnSync } = require("node:child_process");
const G = require("./glib.cjs");

const BS = "\\";
const TAB = "\t";

const CASES = [
  // --- must be ACCEPTED (positive controls) -----------------------------
  { u: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", want: "accept" },
  { u: "https://youtube.com/watch?v=dQw4w9WgXcQ", want: "accept" },
  { u: "https://m.youtube.com/watch?v=dQw4w9WgXcQ", want: "accept" },
  { u: "https://music.youtube.com/watch?v=dQw4w9WgXcQ", want: "accept" },
  { u: "https://youtu.be/dQw4w9WgXcQ", want: "accept" },
  { u: "https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ", want: "accept", note: "uppercase host" },
  { u: "https://www.youtube.com./watch?v=x", want: "accept", note: "trailing dot" },
  { u: "http://www.youtube.com/watch?v=x", want: "accept", note: "plain http" },

  // --- must be REFUSED --------------------------------------------------
  { u: "https://youtube.com.evil.example/watch?v=x", want: "refuse", note: "suffix" },
  { u: "https://notyoutube.com/watch?v=x", want: "refuse" },
  { u: "https://youtube.com.br/watch?v=x", want: "refuse" },
  { u: "https://evil.example/youtube.com/watch", want: "refuse", note: "path" },
  { u: "https://evil.example/?next=https://www.youtube.com/watch", want: "refuse", note: "query" },
  { u: "https://evil.example/x#youtube.com", want: "refuse", note: "fragment (run 1's bypass)" },
  { u: "file:///etc/passwd#youtube.com", want: "refuse" },
  { u: "ftp://www.youtube.com/x", want: "refuse", note: "scheme" },
  { u: "data:text/html,youtube.com", want: "refuse" },
  { u: "https://www.youtube.com@evil.example/x", want: "refuse", note: "userinfo" },
  { u: "https://www.youtube.com:pass@evil.example/x", want: "refuse", note: "userinfo+pw" },
  { u: "http://169.254.169.254/youtube.com/latest/meta-data/", want: "refuse", note: "link-local" },
  { u: "http://127.0.0.1:22/youtube.com", want: "refuse", note: "loopback" },
  { u: "http://[::1]:5174/youtube.com", want: "refuse", note: "ipv6 loopback" },
  { u: "http://2130706433/youtube.com", want: "refuse", note: "decimal IP" },
  { u: "http://0x7f000001/youtube.com", want: "refuse", note: "hex IP" },
  { u: "http://127.1/youtube.com", want: "refuse", note: "short IP" },
  { u: "https://xn--yutube-dva.com/watch?v=x", want: "refuse", note: "punycode lookalike (yútube)" },
  { u: "https://www.yoùtube.com/watch?v=x", want: "refuse", note: "unicode lookalike" },
  { u: "https://уoutube.com/watch?v=x", want: "refuse", note: "cyrillic u homoglyph" },
  { u: "https://youtu.be.evil.example/x", want: "refuse" },
  { u: "https://evil.example/youtu.be/x", want: "refuse" },
  { u: "https://xn--youtube-fya.com/x", want: "refuse", note: "punycode" },
  { u: "https://www.youtube.com。evil.example/x", want: "refuse", note: "ideographic full stop" },
  { u: "https://user@www.youtube.com/watch?v=x", want: "refuse", note: "userinfo on a real host" },

  // --- parser differentials --------------------------------------------
  {
    u: `https://www.youtube.com${BS}@evil.example/watch?v=x`,
    want: "refuse",
    note: "single backslash before the userinfo marker",
  },
  {
    u: `https://www.youtube.com${BS}${BS}@evil.example/watch?v=x`,
    want: "refuse",
    note: "double backslash",
  },
  {
    u: `https://www.youtube.com${BS}.evil.example/x`,
    want: "refuse",
    note: "backslash then a sibling host",
  },
  {
    u: `https://www.youtube.com${TAB}@evil.example/x`,
    want: "refuse",
    note: "tab inside the authority",
  },
  {
    u: "https://www.youtube.com\n@evil.example/x",
    want: "refuse",
    note: "newline inside the authority",
  },
  {
    u: "https://@www.youtube.com/watch?v=x",
    want: "accept",
    note: "empty userinfo, both parsers agree on the host",
  },
];

function nodeHost(u) {
  try {
    const x = new URL(u);
    return { host: x.hostname, user: x.username, href: x.href };
  } catch {
    return { host: null, user: null, href: null };
  }
}

function pythonHost(u) {
  const r = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      "import sys,json\nfrom urllib.parse import urlsplit\ns=urlsplit(sys.argv[1])\nprint(json.dumps({'netloc':s.netloc,'host':s.hostname}))",
      u,
    ],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return { netloc: null, host: null, err: (r.stderr || "").slice(0, 120) };
  }
}

async function main() {
  const out = { when: new Date().toISOString(), rows: [] };
  const s = await G.startServer({ label: "urls", cfg: { duration: 30 } });

  for (const c of CASES) {
    s.clearCalls();
    const r = await s.post("/api/info", { url: c.u });
    const calls = s.calls();
    const nh = nodeHost(c.u);
    const ph = pythonHost(c.u);
    const accepted = r.status === 200 || calls.length > 0;
    out.rows.push({
      url: c.u,
      note: c.note,
      want: c.want,
      status: r.status,
      error: r.json && r.json.error,
      ytRuns: calls.length,
      argvFirst: calls.length ? calls[0].argv[0] : null,
      urlIsExactlyOneArgv: calls.length ? calls[0].argv[0] === c.u : null,
      nodeHost: nh.host,
      nodeUser: nh.user,
      pythonHost: ph.host,
      parsersDisagree: Boolean(nh.host && ph.host && nh.host !== ph.host),
      verdict:
        (accepted ? "accept" : "refuse") === c.want ? "as expected" : "WRONG",
    });
  }

  out.wrong = out.rows.filter((r) => r.verdict === "WRONG");
  out.differentialsAccepted = out.rows.filter(
    (r) => r.parsersDisagree && r.ytRuns > 0,
  );
  await s.stop();

  for (const r of out.rows) {
    console.log(
      `${r.verdict === "WRONG" ? "WRONG   " : "ok      "} ${String(r.status).padEnd(4)} yt=${r.ytRuns} node=${String(r.nodeHost).padEnd(24)} py=${String(r.pythonHost).padEnd(24)} ${JSON.stringify(r.url)} ${r.note || ""}`,
    );
  }
  console.log(`\nWRONG: ${out.wrong.length}`);
  console.log(
    `accepted URLs where the two parsers disagree about the host: ${out.differentialsAccepted.length}`,
  );
  console.log("results:", G.saveResults("g7-urls", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
