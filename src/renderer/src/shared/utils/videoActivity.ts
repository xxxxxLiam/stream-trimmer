/**
 * File: videoActivity.ts
 * Path: src/renderer/src/shared/utils/videoActivity.ts
 * Description: When each video last had a clip made from it (video id to time). The Videos list sorts by latest
 *   activity, newest first: a video added or clipped from goes to the top (Liam, 28 Nov). Kept across launches.
 */
import { readSetting, writeSetting } from "./persist";

export const ACTIVITY_KEY = "clipper.videoActivity";

export type ActivityMap = Record<string, number>;

/** What a stored record makes of itself: only video ids with a real time survive. */
export function normalizeActivity(raw: unknown): ActivityMap {
  const out: ActivityMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === "number" && Number.isFinite(at) && at > 0) out[id] = at;
  }
  return out;
}

/** The map with `videoId` touched at `now`. Never moves a time backwards. */
export function touched(map: ActivityMap, videoId: string, now: number): ActivityMap {
  if (!videoId || (map[videoId] ?? 0) >= now) return map;
  return { ...map, [videoId]: now };
}

let current: ActivityMap | null = null;
const listeners = new Set<() => void>();

export const activityStore = {
  get(): ActivityMap {
    if (current === null) current = normalizeActivity(readSetting<unknown>(ACTIVITY_KEY, {}));
    return current;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  touch(videoId: string | null | undefined, now: number = Date.now()) {
    if (!videoId) return;
    const next = touched(activityStore.get(), videoId, now);
    if (next === current) return;
    current = next;
    writeSetting(ACTIVITY_KEY, next);
    listeners.forEach((l) => l());
  },
};

/** For tests: forget what was loaded. */
export function resetActivityStore(): void {
  current = null;
}
