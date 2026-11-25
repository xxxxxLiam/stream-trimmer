/**
 * File: crashRecovery.ts
 * Path: src/main/modules/windows/crashRecovery.ts
 * Description: Decides what to do when the window's page process dies. Reload it on the crash screen; a second
 *   death soon after shows a static fallback page instead (no page script to die again), so a page that dies on
 *   load cannot loop and the person is never left on a blank window. Pure (no electron import) so it can be tested.
 */

/** A death that is not a crash: the page was closed on purpose. */
const BENIGN = new Set(["clean-exit"]);

/** How long a reload counts as "just reloaded". A page that dies again inside it gets the fallback page, not another reload. */
export const RELOAD_WINDOW_MS = 60_000;

/** The flag the reloaded page reads to show its crash screen. */
export const CRASHED_QUERY = "crashed=1";

export function createCrashRecovery(now: () => number = Date.now) {
  let lastReloadAt = -Infinity;
  return {
    /** "reload": load the app on its crash screen. "fallback": load the static page. "leave": a deliberate close. */
    onGone(reason: string): "reload" | "fallback" | "leave" {
      if (BENIGN.has(reason)) return "leave";
      const t = now();
      if (t - lastReloadAt < RELOAD_WINDOW_MS) return "fallback";
      lastReloadAt = t;
      return "reload";
    },
  };
}

/** The page address to load again, carrying the crashed flag. */
export function crashedUrl(appUrl: string): string {
  const u = new URL(appUrl);
  u.search = CRASHED_QUERY;
  return u.toString();
}

/**
 * What the window loads after its page process died: the app on the crash screen, the static fallback page, or
 * nothing (a deliberate close). The one place that turns a death into an address, so a test can pin it (E3-2).
 */
export function pageAfterDeath(
  recovery: { onGone(reason: string): "reload" | "fallback" | "leave" },
  reason: string,
  appUrl: string,
  fallbackUrl: () => string,
): string | null {
  const what = recovery.onGone(reason);
  if (what === "leave") return null;
  return what === "fallback" ? fallbackUrl() : crashedUrl(appUrl);
}
