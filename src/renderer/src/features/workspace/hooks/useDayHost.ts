/**
 * File: useDayHost.ts
 * Path: src/renderer/src/features/workspace/hooks/useDayHost.ts
 * Description: Where the day stands and how to move on, for the preview's end card: clips made
 *   today against the quota, the next open video with moments waiting, and "Next video".
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { bankStore } from "../../../shared/utils/bank";
import { clipsMadeToday } from "../../../shared/utils/campaigns";
import { extractVideoId } from "../../../shared/utils/clip";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import type { DayState } from "../../../modules/layout/hooks/PanelHostContext";
import { useWorkspace } from "./WorkspaceContext";
import { nextWaitingId, waitingIn } from "../utils/videoList";

export function useDayHost(): { day: DayState; onNextVideo: () => void } {
  const ws = useWorkspace();
  const { active: campaign } = useCampaign();
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);

  const waitingOf = useCallback(
    (t: { url?: string; campaignId?: string }) =>
      waitingIn(bank, t.campaignId, t.url ? extractVideoId(t.url) : null),
    [bank],
  );
  const nextId = nextWaitingId(ws.tabs, ws.activeId, waitingOf);
  const nextTab = ws.tabs.find((t) => t.id === nextId);

  const day = useMemo<DayState>(
    () => ({
      campaignName: campaign?.name ?? null,
      next: nextTab ? { title: ws.labelFor(nextTab.id), waiting: waitingOf(nextTab) } : null,
      made: clipsMadeToday(campaign),
      quota: campaign?.dailyQuota ?? null,
    }),
    [campaign, nextTab, ws, waitingOf],
  );

  const onNextVideo = useCallback(() => {
    if (nextId) ws.selectTab(nextId);
  }, [nextId, ws]);

  return { day, onNextVideo };
}
