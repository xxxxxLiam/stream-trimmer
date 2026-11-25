/**
 * File: TopBar.tsx
 * Path: src/renderer/src/modules/layout/components/TopBar.tsx
 * Description: The top bar (board 03.2.1): the campaign chip with "2 of 3 today" and its menu, the
 *   open video's plain title in the middle, and the icon-only Panels | Help | Settings on the right.
 *   A button that is on (its menu or drawer is open) shows its label beside the icon.
 *   The board's window dots are the mock-up of an OS window; the real window keeps its own frame.
 */
import type { ReactNode } from "react";
import { useClipperContext } from "../../clipper/hooks/ClipperContext";
import { useCampaign } from "../../../features/campaigns/hooks/CampaignContext";
import CampaignChip from "../../../features/campaigns/components/CampaignChip";
import HelpButton from "../../../features/help/components/HelpButton";
import UpdatePill from "../../../features/updates/components/UpdatePill";
import { todayCount } from "../../../shared/utils/campaigns";
import PanelsMenu from "./PanelsMenu";
import type { MenuItem } from "./PopoverMenu";
import { IconSettingsGear } from "./BarIcons";

export type TopBarProps = {
  helpOpen: boolean;
  onToggleHelp: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** Body of the campaign popover. */
  campaignMenu?: ReactNode;
  /** Extra rows for the Panels menu (the overlays that have no panel: Copy blocks, Symbols). */
  panelsMenuExtras?: MenuItem[];
};

export default function TopBar({ helpOpen, onToggleHelp, settingsOpen, onToggleSettings, campaignMenu, panelsMenuExtras }: TopBarProps) {
  const { info } = useClipperContext();
  const { active } = useCampaign();
  const today = todayCount(active);

  return (
    <header className="topbar relative flex h-[53px] shrink-0 items-center gap-[12px] border-b border-hairline pl-[16px] pr-[12px]">
      {active ? <CampaignChip menu={campaignMenu} /> : null}
      {today ? (
        <span id="ui-today-count" className="text-meta text-fg-dim">
          {today}
        </span>
      ) : null}
      <span className="pointer-events-none absolute inset-x-0 truncate px-[192px] text-center text-body font-medium">
        {info?.title ?? ""}
      </span>
      <div className="relative ml-auto flex items-center gap-[2px]">
        <UpdatePill />
        <PanelsMenu extraItems={panelsMenuExtras} />
        <HelpButton open={helpOpen} onToggle={onToggleHelp} />
        <button
          type="button"
          id="ui-settings"
          className="icon-btn"
          aria-label="Settings"
          title="Settings (⌘,)"
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
        >
          <IconSettingsGear />
          {settingsOpen ? <span className="icon-label ml-[8px] text-body">Settings</span> : null}
        </button>
      </div>
    </header>
  );
}
