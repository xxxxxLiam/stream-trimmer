/**
 * File: inFlightCut.ts
 * Path: src/renderer/src/shared/utils/inFlightCut.ts
 * Description: The Clip-button cut that is being made, saved to the settings file while it runs. Pressing Clip clears
 *   the marks at once, so a quit or crash mid-cut would lose the range. At the next launch the range comes back as a
 *   waiting moment (the cut was interrupted), and "Your range is kept" holds.
 */
import { readSetting, writeSetting } from "./persist";
import type { Segment } from "./segments";

const KEY = "clipper.cutInFlight";

export type InFlightCut = { campaignId: string; videoId: string; name: string; segments: Segment[] };

/** Only a well-formed record counts; anything else is ignored. */
export function readInFlightCut(raw: unknown): InFlightCut | null {
  const r = raw as Partial<InFlightCut> | null | undefined;
  if (!r || typeof r.campaignId !== "string" || typeof r.videoId !== "string" || typeof r.name !== "string" || !Array.isArray(r.segments)) return null;
  const segments = r.segments.filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start).map((s) => ({ start: s.start, end: s.end }));
  return segments.length ? { campaignId: r.campaignId, videoId: r.videoId, name: r.name, segments } : null;
}

export const saveInFlightCut = (cut: InFlightCut): void => writeSetting(KEY, cut);
export const clearInFlightCut = (): void => writeSetting(KEY, null);

/** At launch: hand back the cut that was interrupted (and forget it). */
export function takeInterruptedCut(): InFlightCut | null {
  const cut = readInFlightCut(readSetting<unknown>(KEY, null));
  if (cut || readSetting<unknown>(KEY, null) !== null) clearInFlightCut();
  return cut;
}
