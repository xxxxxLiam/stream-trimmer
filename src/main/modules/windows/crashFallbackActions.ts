/**
 * File: crashFallbackActions.ts
 * Path: src/main/modules/windows/crashFallbackActions.ts
 * Description: Answers the three links on the static crash page: Reopen Clipr (load the app again), Send report (one
 *   crash report through the relay queue, then the page says so) and Copy details (the cleaned log to the clipboard).
 *   The things it needs are passed in, so it tests without Electron.
 */
import { crashFallbackUrl, type FallbackAction, type FallbackState } from "./crashFallback";

export interface FallbackDeps {
  appUrl: string;
  load: (url: string) => void;
  /** Sends one crash report; "sent" when the relay took it, "kept" when it waits for a later launch. */
  send: () => Promise<"sent" | "kept">;
  /** Puts the cleaned details on the clipboard. */
  copy: () => void;
}

export function createFallbackController(d: FallbackDeps) {
  let state: FallbackState = {};
  const show = () => d.load(crashFallbackUrl(state));
  return {
    /** The first time the page is shown (or shown again after a new crash): nothing sent or copied yet. */
    reset(): FallbackState {
      state = {};
      return state;
    },
    async run(action: FallbackAction): Promise<void> {
      if (action === "reopen") return d.load(d.appUrl);
      if (action === "send") {
        if (state.sent) return;
        try {
          state = { ...state, sent: await d.send() };
        } catch {
          state = { ...state, sent: "kept" };
        }
        return show();
      }
      try {
        d.copy();
        state = { ...state, copied: true };
      } catch {
        /* the clipboard is not worth a second failure */
      }
      show();
    },
    state: () => state,
  };
}
