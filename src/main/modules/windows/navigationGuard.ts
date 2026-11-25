/**
 * File: navigationGuard.ts
 * Path: src/main/modules/windows/navigationGuard.ts
 * Description: Which addresses the app window may navigate to, and which may be handed to the person's
 *   browser. Pure (no electron import) so it can be tested. The window only ever shows the app's own
 *   origin; everything else is refused here or sent to the browser as a plain https link.
 */

/** True when `url` is the app itself: the loopback engine page, or the dev server. */
export function isAppUrl(url: string, appOrigins: readonly string[]): boolean {
  try {
    return appOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** A link that may go to the person's browser: https, or a mailto: for Help. Nothing else (smb:, file:, ms-msdt:...). */
export function isSafeExternalUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length > 4096) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}
