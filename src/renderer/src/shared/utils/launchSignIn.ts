/**
 * File: launchSignIn.ts
 * Path: src/renderer/src/shared/utils/launchSignIn.ts
 * Description: What happens about the YouTube sign-in when the app opens: read the saved cookies.txt; if that gives
 *   no session, quietly try the browsers' own YouTube sign-in; then tell the main process whether any of it works, so
 *   the footer's "Sign in for 1080p" pill shows only when nothing does. Dependencies are passed in so it is testable.
 */
export async function runLaunchSignIn(deps: {
  restore: () => Promise<boolean>;
  sweep: () => Promise<boolean>;
  report: (usable: boolean) => Promise<unknown> | void;
}): Promise<boolean> {
  let usable = false;
  try {
    usable = (await deps.restore()) || (await deps.sweep());
  } catch {
    usable = false;
  }
  try {
    await deps.report(usable);
  } catch {
    /* the pill simply stays hidden */
  }
  return usable;
}
