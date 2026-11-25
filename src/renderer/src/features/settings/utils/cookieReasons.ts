/**
 * File: cookieReasons.ts
 * Path: src/renderer/src/features/settings/utils/cookieReasons.ts
 * Description: The sentences shown under the drop zone when a cookies.txt is refused ("Wrong cookies
 *   file", approved): the reason in error red, then the fix in plain text, one sentence each. The
 *   engine's answer carries both sentences; the table below is only the fallback for an answer that
 *   carries a reason key and no sentences.
 */

export type CookieReason = { reason: string; fix: string };

/**
 * The engine's refusal. Today `reason` is the key and `message` and `fix` are the sentences; an
 * older shape used `kind` and `error`. Both are read.
 */
export type CookieRefusal = { ok: boolean; reason?: string; kind?: string; message?: string; error?: string; fix?: string };

/** Keys arrive as "wrong-site" or "wrong_site", and "too_old" is the same case as "session-ended". */
function keyOf(res: CookieRefusal | undefined): string {
  const raw = (res?.reason ?? res?.kind ?? "").replace(/_/g, "-");
  return raw === "too-old" || raw === "wrong-format" ? (raw === "too-old" ? "session-ended" : "not-a-cookies-file") : raw;
}

const FALLBACK: Record<string, CookieReason> = {
  "wrong-site": {
    reason: "This file has no YouTube cookies in it.",
    fix: "Open youtube.com while signed in, then export the cookies from that page.",
  },
  "signed-out": {
    reason: "You were signed out when this file was exported.",
    fix: "Sign in to YouTube, then export the cookies again.",
  },
  "session-ended": {
    reason: "YouTube has ended this session.",
    fix: "Sign in to YouTube again, then export a fresh file.",
  },
  "not-a-cookies-file": {
    reason: "This isn’t a cookies file.",
    fix: "Export from the “Get cookies.txt LOCALLY” extension and drop that file.",
  },
};

/** The two sentences for a refusal. Anything unrecognised reads as "not a cookies file". */
export function cookieReason(res: CookieRefusal | undefined): CookieReason {
  const base = FALLBACK[keyOf(res)] || FALLBACK["not-a-cookies-file"];
  return { reason: (res?.message ?? res?.error)?.trim() || base.reason, fix: res?.fix?.trim() || base.fix };
}
