/**
 * File: tipsStore.ts
 * Path: src/renderer/src/features/tips/utils/tipsStore.ts
 * Description: The one place tips are on or off, and which are seen. Every open video's controller reads it, so
 *   "Turn off tips" in one video turns them off in all of them at once (and is saved for the next launch).
 */
import { useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { TIPS_ON_KEY, TIPS_SEEN_KEY, normalizeSeen, type Seen } from "./tipsSeen";

let on = readSetting<boolean>(TIPS_ON_KEY, true) !== false;
let seen: Seen = normalizeSeen(readSetting<unknown>(TIPS_SEEN_KEY, {}));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getTipsOn = () => on;
export const getSeen = () => seen;

export function setTipsOn(next: boolean): void {
  on = next;
  writeSetting(TIPS_ON_KEY, next);
  emit();
}

export function setSeen(next: Seen): void {
  seen = next;
  writeSetting(TIPS_SEEN_KEY, next);
  emit();
}

export const useTipsOn = () => useSyncExternalStore(subscribe, getTipsOn, getTipsOn);
export const useSeen = () => useSyncExternalStore(subscribe, getSeen, getSeen);
