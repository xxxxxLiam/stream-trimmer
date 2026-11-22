/**
 * File: g7b-ssrf-control.cjs
 * Path: audit/run-2/area-G/g7b-ssrf-control.cjs
 * Description: The honest bound on G2-2. The URL the server accepts
 * (`http://www.youtube.com\@127.0.0.1:<port>/internal/admin`) resolves to the
 * loopback listener under Python's parser, so the real bundled yt-dlp should
 * fetch THIS script's HTTP server. It does not — and neither does a plain
 * `http://127.0.0.1:<port>/` URL, which is the CONTROL: loopback fetches from
 * that binary do not work in this container, so the request half of the
 * finding is "not provable here" rather than "does not happen".
 *
 * Writes audit/run-2/area-G/logs/ssrf-control.txt.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const G = require("./glib.cjs");

const lines = [];
const say = (s) => {
  lines.push(s);
  console.log(s);
};

const hits = [];
const srv = http.createServer((req, res) => {
  hits.push({ method: req.method, url: req.url, host: req.headers.host });
  res.setHeader("content-type", "text/html");
  res.end("<html><head><title>INTERNAL-ONLY-PAGE</title></head><body>x</body></html>");
});

// no proxy for the child: the agent proxy would hide which host it tried
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)),
);

srv.listen(0, "127.0.0.1", () => {
  const port = srv.address().port;
  const cases = [
    { label: "the accepted backslash URL", url: `http://www.youtube.com\\@127.0.0.1:${port}/internal/admin` },
    { label: "CONTROL: a plain loopback URL", url: `http://127.0.0.1:${port}/plain-control` },
  ];
  for (const c of cases) {
    say(`\n=== ${c.label}: ${JSON.stringify(c.url)}`);
    say(`node:URL host   : ${new URL(c.url).hostname}  path: ${new URL(c.url).pathname}`);
    const py = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        "import sys\nfrom urllib.parse import urlsplit\ns=urlsplit(sys.argv[1])\nprint(s.hostname, s.port, s.path)",
        c.url,
      ],
      { encoding: "utf8" },
    );
    say(`python urlsplit : ${py.stdout.trim()}`);
    const r = spawnSync(
      path.join(G.repoRoot, "resources", "bin", "yt-dlp"),
      ["--socket-timeout", "5", "--dump-single-json", "--no-warnings", "--no-playlist", c.url],
      { encoding: "utf8", env, timeout: 90_000 },
    );
    say(`yt-dlp exit     : ${r.status}`);
    say(`yt-dlp stderr   : ${(r.stderr || "").split("\n").filter((l) => /ERROR|Extracting/.test(l)).slice(0, 2).join(" | ")}`);
  }
  say(`\nrequests this script's listener received: ${JSON.stringify(hits)}`);
  say(
    hits.length === 0
      ? "=> the control also received nothing, so loopback fetches from this binary\n   do not work in this container: the request half of G2-2 is NOT PROVABLE HERE."
      : "=> the listener was reached",
  );
  srv.close();
  fs.mkdirSync(path.join(G.AREA, "logs"), { recursive: true });
  fs.writeFileSync(path.join(G.AREA, "logs", "ssrf-control.txt"), lines.join("\n") + "\n");
});
