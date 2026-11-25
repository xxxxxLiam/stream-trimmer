/**
 * File: signInSignal.ts
 * Path: src/main/shared/utils/signInSignal.ts
 * Description: Whether clips would come out at low quality for want of a YouTube sign-in. Written
 *   by the cookie file (youtube feature), the silent browser sweep and the engine (download
 *   feature); read by the footer. Pure, no electron import.
 */
import type { SignInSignal } from "../../../common/types/signIn";

export function createSignInState() {
  /** A usable imported cookies.txt is on disk. */
  let fileUsable = false;
  /** Result of the silent browser sweep; null until it has finished. */
  let browserUsable: boolean | null = null;
  /** YouTube turned the session down during a download. */
  let sessionEnded = false;
  let last = false;
  const listeners = new Set<(signal: SignInSignal) => void>();

  const compute = () => {
    if (sessionEnded) return true;
    if (fileUsable || browserUsable === true) return false;
    // Unknown (sweep not finished) is not low quality: the pill must not flash at launch.
    return browserUsable === false;
  };
  const publish = () => {
    const next = compute();
    if (next === last) return;
    last = next;
    for (const cb of listeners) cb({ lowQualityWithoutSignIn: next });
  };

  return {
    get: (): SignInSignal => ({ lowQualityWithoutSignIn: compute() }),
    subscribe(cb: (signal: SignInSignal) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** A cookies.txt was imported, removed or read at launch. A fresh import clears an ended session. */
    setFileUsable(usable: boolean) {
      fileUsable = usable;
      if (usable) sessionEnded = false;
      publish();
    },
    setBrowserUsable(usable: boolean) {
      browserUsable = usable;
      if (usable) sessionEnded = false;
      publish();
    },
    /** YouTube rejected the session mid-download (it ended); the pill returns. */
    sessionEnded() {
      sessionEnded = true;
      publish();
    },
    /** A download proved the session works. */
    sessionConfirmed() {
      sessionEnded = false;
      publish();
    },
  };
}

/**
 * One signal per process. The engine is bundled apart from main (out/main/engine.cjs) and gets its own copy of this
 * module, so a plain module-level instance would be two: the engine's "session ended" would never reach the footer's
 * signal (A2-1). The instance lives on globalThis, which both bundles share.
 */
const SHARED = Symbol.for("clipr.signInSignal");
type Shared = ReturnType<typeof createSignInState>;
const host = globalThis as unknown as Record<symbol, Shared | undefined>;
export const signIn: Shared = (host[SHARED] ??= createSignInState());
