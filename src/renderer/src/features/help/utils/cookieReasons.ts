/**
 * File: cookieReasons.ts
 * Path: src/renderer/src/features/help/utils/cookieReasons.ts
 * Description: The sentences shown under the drop zone when a cookies.txt is refused ("Wrong cookies
 *   file", approved): the reason in error red, then the fix in plain text, one sentence each. The
 *   engine's answer carries both sentences; the table below is only the fallback for an answer that
 *   carries a reason key and no sentences.
 */

export type CookieReason = { reason: string; fix: string };

/** The engine's refusal: `reason` is a key, `message` and `fix` are the sentences. */
export type CookieRefusal = { ok: boolean; reason?: string; message?: string; fix?: string };

const FALLBACK: Record<string, CookieReason> = {
  "wrong-site": {
    reason: "This file was made on google.com, not youtube.com.",
    fix: "Open youtube.com, then export the cookies from that page.",
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
  const base = (res?.reason && FALLBACK[res.reason]) || FALLBACK["not-a-cookies-file"];
  return { reason: res?.message?.trim() || base.reason, fix: res?.fix?.trim() || base.fix };
}
