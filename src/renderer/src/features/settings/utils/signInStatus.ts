/**
 * File: signInStatus.ts
 * Path: src/renderer/src/features/settings/utils/signInStatus.ts
 * Description: The sign-in status card's state (board 04.6, option A): Checking, Signed in, Couldn't
 *   sign in, plus "saved" for the engine's "saved but couldn't be checked" answer (not drawn yet).
 *   A module store so the card is still there when the page is left and reopened, and the Settings
 *   YouTube row reads the same value.
 */
import { useSyncExternalStore } from "react";
import { cookieReason, type CookieRefusal } from "./cookieReasons";

export type SignInStatus =
  | { state: "checking" }
  | { state: "signed-in"; account?: string; justChecked: boolean }
  | { state: "failed"; reason: string; fix: string }
  | { state: "saved"; message: string };

/** What the main process answers after a drop: the refusal fields, or ok plus YouTube's verdict. */
export type CookieAnswer = CookieRefusal & { verify?: "signed_in" | "rejected" | "unverified"; account?: string };

let current: SignInStatus | null = null;
const listeners = new Set<() => void>();

export function setSignInStatus(next: SignInStatus | null): void {
  current = next;
  listeners.forEach((l) => l());
}

export function signInStatusNow(): SignInStatus | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useSignInStatus(): SignInStatus | null {
  return useSyncExternalStore(subscribe, signInStatusNow, signInStatusNow);
}

/** "Sentence one. Sentence two." becomes the reason and the fix. */
function splitSentences(text: string): { reason: string; fix: string } {
  const at = text.search(/[.!?]\s/);
  if (at < 0) return { reason: text, fix: "" };
  return { reason: text.slice(0, at + 1), fix: text.slice(at + 2).trim() };
}

/** The status an answer from the main process stands for. No answer reads as a refusal. */
export function statusFromAnswer(res: CookieAnswer | undefined): SignInStatus {
  if (!res?.ok) return { state: "failed", ...cookieReason(res) };
  if (res.verify === "rejected") {
    const s = splitSentences(res.message?.trim() || "YouTube didn't accept this sign-in.");
    return { state: "failed", reason: s.reason, fix: s.fix || "Export a fresh cookies file while signed in and add it again." };
  }
  if (res.verify === "unverified") return { state: "saved", message: res.message?.trim() || "The file was saved, but Clipr couldn't check it with YouTube just now." };
  return { state: "signed-in", account: res.account?.trim() || undefined, justChecked: true };
}

/** The Settings YouTube row's value. `connected` is the saved sign-in, used when nothing was checked this session. */
export function signInRowValue(status: SignInStatus | null, connected: boolean): string {
  if (status?.state === "checking") return "Checking…";
  if (status?.state === "saved") return "Saved";
  if (status?.state === "signed-in") return "Signed in";
  return connected ? "Signed in" : "Not signed in";
}
