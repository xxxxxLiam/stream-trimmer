// src/common/utils/redact.ts
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var SENSITIVE_PARAM_EXACT = /* @__PURE__ */ new Set(["s", "ip", "si", "n", "id"]);
var SENSITIVE_PARAM_CONTAINS = /sig|token|secret|key|auth|pass|session|cookie|credential|pot|sid|visitor|ticket/i;
var PATH_SECRET = /\/(id|ip|s|si|n|sig|lsig|signature|pot|key|token|visitor|ticket|session)\/[^/\s]+/gi;
function isSensitiveParam(name) {
  const n = name.toLowerCase();
  return SENSITIVE_PARAM_EXACT.has(n) || SENSITIVE_PARAM_CONTAINS.test(n);
}
var REDACTION_RULES = [
  {
    // Lines that quote the cookies file itself: the Netscape header and its rows.
    id: "cookie-file-contents",
    apply: (t) => t.replace(/^.*Netscape HTTP Cookie File.*$/gim, "[cookie data removed]").replace(
      /(?:#HttpOnly_)?\.?[\w.-]+[ \t]+(?:TRUE|FALSE)[ \t]+\S*[ \t]+(?:TRUE|FALSE)[ \t]+\d+[ \t]+.*$/gim,
      "[cookie data removed]"
    )
  },
  {
    // Cookie, Set-Cookie and Authorization headers, whatever wraps them.
    id: "auth-headers",
    apply: (t) => t.replace(
      /\b((?:set-)?cookie|authorization|proxy-authorization|x-goog-visitor-id|x-goog-pageid|x-youtube-identity-token|x-goog-authuser)(\s*[:=]\s*)[^\n]*/gi,
      "$1$2<redacted>"
    )
  },
  {
    // `--cookies <path>` and `--cookies=<path>`, quoted or not.
    id: "cookies-flag",
    apply: (t) => t.replace(
      /--cookies(?:=|[ \t]+)(?:"[^"\n]*"|'[^'\n]*'|[^\n]*?\.(?:txt|jar|sqlite)\b|\S+)/g,
      "--cookies <redacted>"
    )
  },
  {
    // The same path as an options object: "cookies":"/path/yt-cookies.txt".
    id: "cookies-option",
    apply: (t) => t.replace(/(["']?cookies["']?\s*:\s*)(?:"[^"\n]*"|'[^'\n]*')/gi, '$1"<redacted>"')
  },
  {
    // Any other mention of a cookies file by path.
    id: "cookie-file-path",
    apply: (t) => t.replace(
      /(?<![^\s"'=(])(?:~|[A-Za-z]:)?[\\/][^\n"']*?cookies?[\w.-]*\.(?:txt|jar|sqlite)\b/gi,
      "<cookies file>"
    )
  },
  {
    // Signed URLs: strip the values of token-like and signature-like parameters, and the same
    // names when googlevideo carries them as path segments (`/id/<x>/sig/<y>/file/...`).
    id: "url-secrets",
    apply: (t) => t.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      const cut = url.search(/[?#]/);
      const head = (cut < 0 ? url : url.slice(0, cut)).replace(PATH_SECRET, "/$1/REDACTED");
      const rest = cut < 0 ? "" : url.slice(cut);
      return head + rest.replace(
        /([?&#;])([^=&#;\s]+)=([^&#;\s]*)/g,
        (m, sep, name) => isSensitiveParam(name) ? `${sep}${name}=REDACTED` : m
      );
    })
  },
  {
    // PO tokens and the other identity-bearing values yt-dlp accepts or prints.
    id: "po-token",
    apply: (t) => t.replace(
      /(po[_ -]?tokens?|visitor[_ -]?data|data[_ -]?sync[_ -]?id|access[_ -]?token|refresh[_ -]?token|api[_ -]?key)(["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s"';,&}]+)/gi,
      "$1$2<redacted>"
    ).replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <redacted>")
  },
  {
    // A Google session cookie assigned on its own (`__Secure-3PAPISID=...`), with no `Cookie:`
    // header in front of it for auth-headers to key on.
    id: "cookie-assignment",
    apply: (t) => t.replace(
      /(?<![\w-])((?:__Secure-|__Host-)?(?:[1-3]?PSID(?:CC|TS)?|[1-3]?PAPISID|SAPISID|APISID|HSID|SSID|SIDCC|SID|LOGIN_INFO|VISITOR_INFO1_LIVE))(\s*=\s*)[^\s;,"']+/g,
      "$1$2<redacted>"
    )
  },
  {
    // The same session cookie names as JSON keys: {"SAPISID":"..."}.
    id: "cookie-json",
    apply: (t) => t.replace(
      /(["'](?:__Secure-|__Host-)?(?:[1-3]?PSID(?:CC|TS)?|[1-3]?PAPISID|SAPISID|APISID|HSID|SSID|SIDCC|SID|LOGIN_INFO|VISITOR_INFO1_LIVE)["']\s*:\s*)(?:"[^"\n]*"|'[^'\n]*')/g,
      '$1"<redacted>"'
    )
  },
  {
    // The home directory, wherever it appears: first the exact one we were told,
    // then the usual shapes in case it was spelled differently inside engine output.
    id: "home-dir",
    apply: (t, opts) => {
      let out = t;
      const home = (opts.homeDir ?? "").trim().replace(/[\\/]+$/, "");
      if (home.length > 1) {
        const parts = home.split(/[\\/]+/).filter(Boolean).map(escapeRe);
        const lead = /^[\\/]/.test(home) ? "[\\\\/]" : "";
        const spelled = lead + parts.join("[\\\\/]+");
        out = out.replace(new RegExp(`${spelled}(?![\\w-])`, "gi"), "~");
      }
      return out.replace(/(?<![\w-])[A-Za-z]:[\\/]+Users[\\/]+(?:[^\\/\n"'<>:|*?]+(?=[\\/])|[^\\/\s"'<>:|*?]+)/gi, "~").replace(/(?<![\w~-])\/(?:Users|home)\/(?:[^/\n"'<>:|*?]+(?=\/)|[^/\s"']+)/g, "~").replace(/(?<![\w~-])\/root(?=[\\/\s"']|$)/g, "~");
    }
  },
  {
    // A network share (\\fileserver\home\jane\x.mp4), also as it prints inside JSON (doubled backslashes). The
    // server and folder names can be a person's name, so the whole path goes, up to a quote or line end.
    id: "unc-path",
    apply: (t) => t.replace(/(?<![\w\\])\\{2,}[\w.$-]+[^\n"'<>|*?]*/g, "<network path>")
  },
  {
    id: "email",
    apply: (t) => t.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "<email>")
  },
  {
    // Addresses on the person's own network (the proxy or router in a log line). Loopback stays readable.
    id: "lan-ip",
    apply: (t) => t.replace(/(?<![\d.])(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?![\d.])/g, "<ip>")
  }
];
function redact(text, opts = {}, disabled = /* @__PURE__ */ new Set()) {
  let out = String(text ?? "");
  for (const rule of REDACTION_RULES) {
    if (!disabled.has(rule.id)) out = rule.apply(out, opts);
  }
  return out;
}

// relay/src/strip.ts
var VIDEO_LINK = /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com)[^\s"'<>)]*/gi;
var URL_QUERY = /(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/gi;
var WIN_ANY = /(?<![\w])(?:[A-Za-z]:\\|\\\\)[^\n"'<>|*?]*/g;
function stripIdentity(text) {
  return redact(String(text ?? "")).replace(VIDEO_LINK, "<video link>").replace(URL_QUERY, "$1").replace(WIN_ANY, (m) => /^[A-Za-z]:\\Users\\|~/.test(m) ? m : "<path>");
}

// relay/src/handler.ts
var REPO = "xxxxxLiam/stream-trimmer";
var CLIENT_HEADER = "X-Clipr-Client";
var CLIENT_VALUE = "clipr-app";
var MAX_BODY_BYTES = 32 * 1024;
var MAX_NOTE = 2e3;
var MAX_LOG_LINES = 50;
var REPORTS_PER_HOUR = 5;
var MAX_ERROR = 6e3;
var MAX_LOG_LINE = 400;
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function parseReport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw;
  const allowed = /* @__PURE__ */ new Set(["kind", "note", "error", "appVersion", "os", "log"]);
  if (Object.keys(r).some((k) => !allowed.has(k))) return null;
  if (r.kind !== "crash" && r.kind !== "problem") return null;
  if (typeof r.error !== "string" || !r.error.trim() || r.error.length > MAX_ERROR) return null;
  if (typeof r.appVersion !== "string" || r.appVersion.length > 40) return null;
  if (typeof r.os !== "string" || r.os.length > 80) return null;
  if (!Array.isArray(r.log) || r.log.length > MAX_LOG_LINES || r.log.some((l) => typeof l !== "string" || l.length > MAX_LOG_LINE)) return null;
  if (r.note !== void 0 && (typeof r.note !== "string" || r.note.length > MAX_NOTE)) return null;
  return { kind: r.kind, note: r.note, error: r.error, appVersion: r.appVersion, os: r.os, log: r.log };
}
async function signatureOf(error) {
  const lines = error.split(/\r?\n/);
  const type = (lines[0] ?? "").replace(/[:\s].*$/, "").slice(0, 60) || "Error";
  const frame = lines.find((l) => /^\s*at\s/.test(l)) ?? "";
  const where = /([^\\/()\s]+:\d+)(?::\d+)?\)?\s*$/.exec(frame)?.[1] ?? frame.trim().slice(0, 80);
  const data = new TextEncoder().encode(`${type}|${where}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
function fenced(text) {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const f = "`".repeat(longest + 1);
  return `${f}
${text}
${f}`;
}
function oneLine(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
}
function createRelay(deps) {
  const hits = /* @__PURE__ */ new Map();
  const limited = (ip) => {
    const now = deps.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 36e5);
    if (recent.length >= REPORTS_PER_HOUR) {
      hits.set(ip, recent);
      return true;
    }
    hits.set(ip, [...recent, now]);
    return false;
  };
  return async function relay2(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/report") return json(404, { error: "not_found" });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (request.headers.get(CLIENT_HEADER) !== CLIENT_VALUE) return json(403, { error: "forbidden" });
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(400, { error: "bad_request" });
    }
    const report = parseReport(parsed);
    if (!report) return json(400, { error: "bad_request" });
    if (limited(request.headers.get("CF-Connecting-IP") ?? "unknown")) return json(429, { error: "slow_down" });
    if (!env.GITHUB_TOKEN) return json(502, { error: "relay_unavailable" });
    const clean = {
      kind: report.kind,
      note: stripIdentity(report.note ?? "").trim(),
      error: stripIdentity(report.error).trim(),
      appVersion: stripIdentity(report.appVersion),
      os: stripIdentity(report.os),
      log: report.log.map((l) => stripIdentity(l))
    };
    const signature = await signatureOf(clean.error);
    const repo = env.GITHUB_REPO || REPO;
    const gh = (path, init = {}) => deps.fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "clipr-relay",
        "content-type": "application/json"
      }
    });
    try {
      const label = clean.kind === "crash" ? "crash-report" : "user-report";
      if (clean.kind === "crash") {
        const list = await gh(`/issues?state=open&labels=crash-report&per_page=100`);
        if (!list.ok) return json(502, { error: "relay_unavailable" });
        const open = await list.json();
        const same = open.find((i) => !i.pull_request && (i.body ?? "").includes(`Signature: ${signature}`));
        if (same) {
          const n = (same.comments ?? 0) + 2;
          const c = await gh(`/issues/${same.number}/comments`, {
            method: "POST",
            body: JSON.stringify({ body: `+1 (report ${n})

App ${clean.appVersion} on ${clean.os}` })
          });
          if (!c.ok) return json(502, { error: "relay_unavailable" });
          return json(202, { issue: same.number, duplicate: true });
        }
      }
      await gh(`/labels`, { method: "POST", body: JSON.stringify({ name: label, color: label === "crash-report" ? "d73a4a" : "0e8a16" }) });
      const title = clean.kind === "crash" ? `Crash: ${oneLine(clean.error.split(/\r?\n/)[0] || "unknown error", 100)}` : `Problem: ${oneLine(clean.note || clean.error, 60)}`;
      const body = [
        `**Kind:** ${clean.kind}`,
        `**App:** ${oneLine(clean.appVersion, 40)}`,
        `**System:** ${oneLine(clean.os, 80)}`,
        clean.note ? `### What happened
${fenced(clean.note)}` : "",
        `### Error
${fenced(clean.error)}`,
        clean.log.length ? `### Recent activity
${fenced(clean.log.join("\n"))}` : "",
        `Signature: ${signature}`
      ].filter(Boolean).join("\n\n");
      const made = await gh(`/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: [label] }) });
      if (!made.ok) return json(502, { error: "relay_unavailable" });
      const issue = await made.json();
      return json(202, { issue: issue.number ?? null });
    } catch {
      return json(502, { error: "relay_unavailable" });
    }
  };
}

// relay/src/worker.ts
var relay = createRelay({ fetch: (...args) => fetch(...args), now: () => Date.now() });
var worker_default = {
  fetch: (request, env) => relay(request, env)
};
export {
  worker_default as default
};
