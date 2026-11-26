/**
 * File: makeRequest.ts
 * Path: src/renderer/src/shared/utils/makeRequest.ts
 * Description: The bottom Clip button, pressed while a waiting moment is loaded on the timeline, asks the Export
 *   panel to make THAT moment, the same as its own Clip now. A request waits until a panel for that video
 *   takes it, because Export may not be on screen yet (Clip brings it forward).
 */
export type MakeRequest = { campaignId: string; videoId: string; clipId: string };
type Handler = (r: MakeRequest) => boolean;

const handlers = new Set<Handler>();
let pending: MakeRequest[] = [];

export function requestMake(r: MakeRequest): void {
  for (const h of handlers) if (h(r)) return;
  pending.push(r);
}

/** A panel takes requests it owns (handler returns true). Requests already waiting are offered at once. */
export function onMakeRequest(h: Handler): () => void {
  handlers.add(h);
  pending = pending.filter((r) => !h(r));
  return () => {
    handlers.delete(h);
  };
}
