/**
 * File: startFresh.ts
 * Path: src/main/features/settings/services/startFresh.ts
 * Description: The one-time "Clipr has changed a lot" prompt. Pending only on the first launch after updating (the
 *   store decides, see settingsStore). "Start fresh" first writes a backup of campaigns, bank, history and settings to
 *   Documents/Clipr backups/<date>, checks it, then clears them; "Keep my data" changes nothing. Either way the answer is
 *   recorded so it never shows again. Exported clip files are never touched. Pure Node, so it tests without Electron.
 */
import fs from "node:fs";
import path from "node:path";
import { PAGE_KEYS } from "./settingsKeys";
import { START_FRESH_KEY } from "./settingsStore";

export interface StartFreshStore {
  all: () => Record<string, any>;
  set: (key: string, value: unknown) => boolean;
  removeMany: (keys: string[]) => boolean;
  startFreshPending: () => boolean;
}

export type StartFreshResult = { ok: true; backupDir?: string } | { ok: false; error: string };

/** True when the dialog should show. `CLIPR_SKIP_START_FRESH=1` keeps automated runs from meeting it. */
export function isStartFreshPending(store: StartFreshStore | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!store || env.CLIPR_SKIP_START_FRESH === "1") return false;
  return store.startFreshPending();
}

/** `<documents>/Clipr backups/<date>`, or `<date> 2`, `<date> 3` when that day already has one. Never overwrites. */
export function backupFolder(documentsDir: string, now: Date): string {
  const root = path.join(documentsDir, "Clipr backups");
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  for (let n = 1; n < 1000; n += 1) {
    const dir = path.join(root, n === 1 ? day : `${day} ${n}`);
    if (!fs.existsSync(dir)) return dir;
  }
  return path.join(root, `${day} ${Date.now()}`);
}

export function answerStartFresh(
  choice: unknown,
  store: StartFreshStore | null,
  opts: { documentsDir: string; now?: Date },
): StartFreshResult {
  if (!store || (choice !== "fresh" && choice !== "keep")) return { ok: false, error: "Not a choice." };
  if (choice === "keep") {
    return store.set(START_FRESH_KEY, "keep") ? { ok: true } : { ok: false, error: "Clipr couldn't save your choice." };
  }
  // Back up first, and check the copy before anything is cleared.
  const snapshot = store.all();
  const dir = backupFolder(opts.documentsDir, opts.now ?? new Date());
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    const back = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Object.keys(back).length !== Object.keys(snapshot).length) throw new Error("The backup is incomplete.");
  } catch {
    return { ok: false, error: "Clipr couldn't make the backup, so nothing was changed." };
  }
  // Campaigns, bank, history and settings go. The folders Clipr may save into (main's own list) stay allowed.
  const keys = Object.keys(snapshot).filter((k) => PAGE_KEYS.has(k));
  if (!store.removeMany(keys)) return { ok: false, error: "Clipr couldn't clear your data, so nothing was changed." };
  store.set(START_FRESH_KEY, "fresh");
  return { ok: true, backupDir: dir };
}
