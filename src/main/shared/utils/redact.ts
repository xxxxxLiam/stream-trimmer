/**
 * File: redact.ts
 * Path: src/main/shared/utils/redact.ts
 * Description: Main-process copy of redact() from src/renderer/src/shared/utils/diagnostics.ts, so
 * the log that "Copy log" puts on the clipboard is scrubbed before it leaves
 * the process. The main process cannot import the renderer's TypeScript, so
 * the rules are duplicated here; src/main/shared/utils/redact.test.ts fails if the two
 * ever disagree on a planted-secret corpus.
 */

function escapeRe(s: any) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Query or fragment parameter names whose values are never worth keeping. */
// `id` is the per-session stream identifier on googlevideo URLs (F-19).
const SENSITIVE_PARAM_EXACT = new Set(["s", "ip", "si", "n", "id"]);
const SENSITIVE_PARAM_CONTAINS =
  /sig|token|secret|key|auth|pass|session|cookie|credential|pot|sid|visitor|ticket/i;

/** googlevideo's signed URLs also carry these names as path segments: `/sig/<value>`. */
const PATH_SECRET =
  /\/(id|ip|s|si|n|sig|lsig|signature|pot|key|token|visitor|ticket|session)\/[^/\s]+/gi;

function isSensitiveParam(name: any) {
  const n = name.toLowerCase();
  return SENSITIVE_PARAM_EXACT.has(n) || SENSITIVE_PARAM_CONTAINS.test(n);
}

/** Each rule is independent and single-line, so any one can be disabled in a test. */
const REDACTION_RULES = [
  {
    // Lines that quote the cookies file itself: the Netscape header and its rows.
    id: "cookie-file-contents",
    apply: (t: any) =>
      t
        .replace(/^.*Netscape HTTP Cookie File.*$/gim, "[cookie data removed]")
        .replace(
          /(?:#HttpOnly_)?\.?[\w.-]+[ \t]+(?:TRUE|FALSE)[ \t]+\S*[ \t]+(?:TRUE|FALSE)[ \t]+\d+[ \t]+.*$/gim,
          "[cookie data removed]",
        ),
  },
  {
    // Cookie, Set-Cookie and Authorization headers, whatever wraps them.
    id: "auth-headers",
    apply: (t: any) =>
      t.replace(
        /\b((?:set-)?cookie|authorization|proxy-authorization)(\s*[:=]\s*)[^\n]*/gi,
        "$1$2<redacted>",
      ),
  },
  {
    // `--cookies <path>` and `--cookies=<path>`, quoted or not.
    id: "cookies-flag",
    apply: (t: any) =>
      t.replace(
        /--cookies(?:=|[ \t]+)(?:"[^"\n]*"|'[^'\n]*'|[^\n]*?\.(?:txt|jar|sqlite)\b|\S+)/g,
        "--cookies <redacted>",
      ),
  },
  {
    // The same path as an options object: "cookies":"/path/yt-cookies.txt".
    id: "cookies-option",
    apply: (t: any) =>
      t.replace(/(["']?cookies["']?\s*:\s*)(?:"[^"\n]*"|'[^'\n]*')/gi, '$1"<redacted>"'),
  },
  {
    // Any other mention of a cookies file by path.
    id: "cookie-file-path",
    apply: (t: any) =>
      t.replace(
        /(?<![^\s"'=(])(?:~|[A-Za-z]:)?[\\/][^\n"']*?cookies?[\w.-]*\.(?:txt|jar|sqlite)\b/gi,
        "<cookies file>",
      ),
  },
  {
    // Signed URLs: strip the values of token-like and signature-like parameters, and the same
    // names when googlevideo carries them as path segments (`/id/<x>/sig/<y>/file/...`).
    id: "url-secrets",
    apply: (t: any) =>
      t.replace(/https?:\/\/[^\s"'<>]+/gi, (url: any) => {
        const cut = url.search(/[?#]/);
        const head = (cut < 0 ? url : url.slice(0, cut)).replace(PATH_SECRET, "/$1/REDACTED");
        const rest = cut < 0 ? "" : url.slice(cut);
        return (
          head +
          rest.replace(/([?&#;])([^=&#;\s]+)=([^&#;\s]*)/g, (m: any, sep: any, name: any) =>
            isSensitiveParam(name) ? `${sep}${name}=REDACTED` : m,
          )
        );
      }),
  },
  {
    // PO tokens and the other identity-bearing values yt-dlp accepts or prints.
    id: "po-token",
    apply: (t: any) =>
      t
        .replace(
          /(po[_ -]?tokens?|visitor[_ -]?data|data[_ -]?sync[_ -]?id|access[_ -]?token|refresh[_ -]?token|api[_ -]?key)(["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s"';,&}]+)/gi,
          "$1$2<redacted>",
        )
        .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <redacted>"),
  },
  {
    // A Google session cookie assigned on its own (`__Secure-3PAPISID=...`), with no `Cookie:`
    // header in front of it for auth-headers to key on.
    id: "cookie-assignment",
    apply: (t: any) =>
      t.replace(
        /(?<![\w-])((?:__Secure-|__Host-)?(?:[1-3]?PSID(?:CC|TS)?|[1-3]?PAPISID|SAPISID|APISID|HSID|SSID|SIDCC|SID|LOGIN_INFO|VISITOR_INFO1_LIVE))(\s*=\s*)[^\s;,"']+/g,
        "$1$2<redacted>",
      ),
  },
  {
    // The home directory, wherever it appears: first the exact one we were told,
    // then the usual shapes in case it was spelled differently inside engine output.
    id: "home-dir",
    apply: (t: any, opts: any) => {
      let out = t;
      const home = (opts.homeDir ?? "").trim().replace(/[\\/]+$/, "");
      if (home.length > 1) {
        const parts = home.split(/[\\/]+/).filter(Boolean).map(escapeRe);
        const lead = /^[\\/]/.test(home) ? "[\\\\/]" : "";
        const spelled = lead + parts.join("[\\\\/]+");
        out = out.replace(new RegExp(`${spelled}(?![\\w-])`, "gi"), "~");
      }
      return out
        .replace(/(?<![\w-])[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, "~")
        .replace(/(?<![\w~-])\/(?:Users|home)\/[^/\s"']+/g, "~")
        // Linux root's home has no user name after it: /root/Videos is the home directory.
        .replace(/(?<![\w~-])\/root(?=[\\/\s"']|$)/g, "~");
    },
  },
  {
    id: "email",
    apply: (t: any) => t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>"),
  },
];

/** Removes credentials and identity from free text. */
function redact(text: any, opts = {}) {
  let out = String(text == null ? "" : text);
  for (const rule of REDACTION_RULES) out = rule.apply(out, opts);
  return out;
}

export { redact, REDACTION_RULES };
