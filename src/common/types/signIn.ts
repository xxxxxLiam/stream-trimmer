/**
 * File: signIn.ts
 * Path: src/common/types/signIn.ts
 * Description: The sign-in signal for the footer and the reasons a dropped cookies.txt is refused.
 */

/** Drives the footer's "at 360p" and the "Sign in for 1080p" pill. */
export interface SignInSignal {
  /** True when no browser sign-in is usable and clips would come out at low quality. */
  lowQualityWithoutSignIn: boolean;
}

/** The four approved reasons, in the order they are checked. */
export type CookieRejection = "not-a-cookies-file" | "wrong-site" | "signed-out" | "session-ended";

export interface CookieCheckOk {
  ok: true;
  count: number;
}

export interface CookieCheckRefused {
  ok: false;
  reason: CookieRejection;
  /** One sentence in error red. */
  message: string;
  /** One plain sentence that says the fix. */
  fix: string;
}

export type CookieCheck = CookieCheckOk | CookieCheckRefused;

/**
 * What YouTube said about a cookies.txt right after it was imported.
 * `signed_in`: accepted. `rejected`: YouTube refused it (the sign-in lapsed or was never valid).
 * `unverified`: the file is fine but the live check could not be made (offline, throttled, timed out).
 */
export type ImportVerdict = "signed_in" | "rejected" | "unverified";

export interface ImportVerified {
  verify: ImportVerdict;
  /** Plain sentence for the person, always set. */
  message: string;
}
