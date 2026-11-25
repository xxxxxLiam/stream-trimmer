/**
 * File: TimelineControllerContext.tsx
 * Path: src/renderer/src/features/player/hooks/TimelineControllerContext.tsx
 * Description: One timeline controller per open video, shared by the Timeline panel and the export bar
 *   at the bottom of the window. The controller owns key handlers, so it must exist exactly once.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useTimelineController, type TimelineController } from "./useTimelineController";

const Ctx = createContext<TimelineController | null>(null);

export function TimelineControllerProvider({ children }: { children: ReactNode }) {
  const c = useTimelineController();
  return <Ctx.Provider value={c}>{children}</Ctx.Provider>;
}

export function useTimelineView(): TimelineController {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTimelineView needs a TimelineControllerProvider");
  return c;
}
