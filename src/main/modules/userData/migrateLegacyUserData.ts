/**
 * File: migrateLegacyUserData.ts
 * Path: src/main/modules/userData/migrateLegacyUserData.ts
 * Description: The app was renamed from "YouTube Clipper" to "Clipr" in 4.0.2.
 *   Electron derives userData from the product name, so the new build looks in a
 *   new, empty directory and every existing user would silently lose their
 *   campaigns, clip bank, folder choices and YouTube sign-in.
 *
 *   This copies the old directory's contents across, once, before anything
 *   reads them. It never overwrites: if a file already exists under the new
 *   name it is left alone, so a user who has started fresh is not clobbered,
 *   and a second run is a no-op. The old directory is left in place — if this
 *   goes wrong, the data is still where it was.
 */
import fs from "node:fs";
import path from "node:path";
import electron from "electron";

const { app } = electron;

export function migrateLegacyUserData() {
  try {
    const current = app.getPath("userData");
    const legacy = path.join(path.dirname(current), "YouTube Clipper");
    if (legacy === current || !fs.existsSync(legacy)) return;
    // Only a first run: if settings are already here, the move has happened
    // (or the user has real data under the new name) and we must not touch it.
    if (fs.existsSync(path.join(current, "settings.json"))) return;

    fs.mkdirSync(current, { recursive: true });
    let moved = 0;
    for (const entry of fs.readdirSync(legacy, { withFileTypes: true })) {
      const from = path.join(legacy, entry.name);
      const to = path.join(current, entry.name);
      if (fs.existsSync(to)) continue;
      try {
        fs.cpSync(from, to, { recursive: true, errorOnExist: false });
        moved += 1;
      } catch (err: any) {
        console.error(`[electron] could not carry over ${entry.name}:`, err);
      }
    }
    if (moved) console.log(`[electron] carried ${moved} item(s) over from "YouTube Clipper"`);
  } catch (err: any) {
    // Never let this stop the app starting: a fresh profile is recoverable,
    // a boot loop is not.
    console.error("[electron] user data migration skipped:", err);
  }
}
