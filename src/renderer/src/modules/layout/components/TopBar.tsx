/**
 * File: TopBar.tsx
 * Path: src/renderer/src/modules/layout/components/TopBar.tsx
 * Description: The top bar (board 03.2.1): the campaign chip with "2 of 3 today" and its menu, the
 *   open video's title in the middle (a field that takes a link), and the icon-only Panels | Help | Settings on the right.
 *   A button that is on (its menu or drawer is open) shows its label beside the icon.
 *   On macOS and Windows the bar is the window's title bar: the traffic lights sit at its left (macOS) or
 *   the system window buttons over its right end (Windows), the empty bar drags the window (double-click
 *   zooms) and every control is no-drag. On Linux the real window keeps its own frame.
 */
import type { ReactNode } from "react";
import { useClipperContext } from "../../clipper/hooks/ClipperContext";
import { useCampaign } from "../../../features/campaigns/hooks/CampaignContext";
import CampaignChip from "../../../features/campaigns/components/CampaignChip";
import HelpButton from "../../../features/help/components/HelpButton";
import UpdatePill from "../../../features/updates/components/UpdatePill";
import { useToday } from "../../../shared/hooks/useToday";
import { todayCount } from "../../../shared/utils/campaigns";
import TopBarLinkField from "../../../features/workspace/components/TopBarLinkField";
import PanelsMenu from "./PanelsMenu";
import type { MenuItem } from "./PopoverMenu";
import { IconSettingsGear } from "./BarIcons";
import { useWindowChrome } from "../hooks/useWindowChrome";
import { barIsTitleBar, lightsShowing, topBarPaddingLeft, topBarPaddingRight } from "../utils/topBarInset";

export type TopBarProps = {
  helpOpen: boolean;
  onToggleHelp: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** Body of the campaign popover. */
  campaignMenu?: ReactNode;
  /** Owner build: the Channel data row of the Panels menu. Empty in the public build. */
  panelsMenuExtras?: MenuItem[];
};

export default function TopBar({ helpOpen, onToggleHelp, settingsOpen, onToggleSettings, campaignMenu, panelsMenuExtras }: TopBarProps) {
  const { info } = useClipperContext();
  const { active } = useCampaign();
  const now = useToday();
  const today = todayCount(active, now);
  const chrome = useWindowChrome();

  return (
    <header
      className={`topbar relative flex h-[53px] shrink-0 items-center gap-[12px] border-b border-hairline ${barIsTitleBar(chrome) ? "topbar-drag" : ""}`}
      style={{ paddingLeft: topBarPaddingLeft(chrome), paddingRight: topBarPaddingRight(chrome) }}
      data-lights={lightsShowing(chrome) || undefined}
    >
      {active ? <CampaignChip menu={campaignMenu} /> : null}
      {today ? (
        <span id="ui-today-count" className="text-meta text-fg-dim">
          {today}
        </span>
      ) : null}
      <TopBarLinkField />
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
