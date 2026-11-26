/**
 * File: CampaignSwitchHost.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignSwitchHost.tsx
 * Description: Asks before opening a video from another campaign changes the active one (board 03.2.54). It takes over the
 *   workspace's select while the question is still asked; after one Open, or the tick, opens just switch and the chip changes.
 */
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../workspace/hooks/WorkspaceContext";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { useCampaign } from "../hooks/CampaignContext";
import { SWITCH_SEEN_KEY, campaignSwitchOf } from "../utils/campaignSwitch";
import CampaignSwitchDialog from "./CampaignSwitchDialog";

export default function CampaignSwitchHost() {
  const ws = useWorkspace();
  const { campaigns } = useCampaign();
  const [asking, setAsking] = useState<{ id: string; from: string; to: string } | null>(null);
  const latest = useRef({ tabs: ws.tabs, activeId: ws.activeId, campaigns });
  latest.current = { tabs: ws.tabs, activeId: ws.activeId, campaigns };
  const { setSelectGuard } = ws;

  useEffect(() => {
    setSelectGuard((id) => {
      if (readSetting<boolean>(SWITCH_SEEN_KEY, false)) return false;
      const { tabs, activeId, campaigns: all } = latest.current;
      const sw = campaignSwitchOf(tabs, activeId, id, (c) => all.some((x) => x.id === c));
      if (!sw) return false;
      const name = (c: string) => all.find((x) => x.id === c)?.name ?? "";
      setAsking({ id, from: name(sw.from), to: name(sw.to) });
      return true;
    });
    return () => setSelectGuard(null);
  }, [setSelectGuard]);

  if (!asking) return null;
  return (
    <CampaignSwitchDialog
      video={ws.labelFor(asking.id)}
      from={asking.from}
      to={asking.to}
      onCancel={(tick) => {
        if (tick) writeSetting(SWITCH_SEEN_KEY, true);
        setAsking(null);
      }}
      onOpen={() => {
        // One Open is enough to stop asking (so is the tick, even on Cancel).
        writeSetting(SWITCH_SEEN_KEY, true);
        ws.selectTabNow(asking.id);
        setAsking(null);
      }}
    />
  );
}
