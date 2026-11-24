/**
 * File: AppHeader.tsx
 * Path: src/renderer/src/modules/layout/components/AppHeader.tsx
 * Description: 48px header (BUILD-SPEC section 3): mark, campaign chip, source chip,
 *   spacer, subordinate links, settings, and HELP always last.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useClipperContext } from "../../clipper/hooks/ClipperContext";
import { useIsTabActive } from "../../../features/workspace/hooks/WorkspaceContext";
import UrlBar from "../../clipper/components/UrlBar";
import YouTubeStatusChip from "../../../features/youtubeConnection/components/YouTubeStatusChip";
import UpdateStatus from "../../../features/updates/components/UpdateStatus";
import { formatTimestamp } from "../../../shared/utils/clip";
import BrandMark from "../../../shared/components/BrandMark";
import CampaignChip from "../../../features/campaigns/components/CampaignChip";
import HelpButton from "../../../features/help/components/HelpButton";
import { IconChannel, IconCopy, IconSettings, IconSymbol } from "../../../shared/components/icons";
import { CHANNEL_DATA_BUILT } from "../../../shared/utils/ownerGate";

export type AppHeaderProps = {
  /** Only ever passed in a channel-data build (App spreads it behind the compile-time flag). */
  screen?: "workspace" | "channel";
  /** Switch screens. The channel exporter is its own screen, not a peer tab. */
  onScreen?: (s: "workspace" | "channel") => void;
  /** Show the Channel data link. Unset when the feature is compiled out; false when locked. */
  channelAvailable?: boolean;
  copyOpen: boolean;
  onToggleCopy: () => void;
  symbolsOpen: boolean;
  onToggleSymbols: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  /** Body of the campaign popover. TODO(B4). */
  campaignMenu?: ReactNode;
  /** The Panels menu button, placed before Help. */
  panelsMenu?: ReactNode;
};

function SourceChip() {
  const { info, duration, loadingInfo } = useClipperContext();
  const [changing, setChanging] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const active = useIsTabActive();

  // Once a new video has loaded, collapse back to the chip.
  useEffect(() => {
    setChanging(false);
  }, [info?.id]);

  // ⌘L opens the URL input even when the chip is collapsed.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        setChanging(true);
        requestAnimationFrame(() => slot.current?.querySelector("input")?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const showInput = !info || changing || loadingInfo;
  return (
    <div
      ref={slot}
      id="ui-source-chip"
      className="min-w-0 flex-[1_1_240px] sm:max-w-[560px]"
    >
      {showInput ? (
        <UrlBar />
      ) : (
        <div className="chip w-full" title={info?.title}>
          <span className="min-w-0 flex-1 truncate">{info?.title}</span>
          <time className="shrink-0 font-mono text-fg-dim">
            {formatTimestamp(duration)}
          </time>
          <button
            type="button"
            className="shrink-0 rounded-chip px-1 text-fg-dim underline-offset-2 hover:text-fg hover:underline"
            onClick={() => {
              setChanging(true);
              requestAnimationFrame(() => slot.current?.querySelector("input")?.focus());
            }}
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppHeader(p: AppHeaderProps) {

  // Every channel reference is behind the COMPILE-TIME flag, so a public build drops the
  // strings entirely; testing a runtime prop here is what used to leave them in the bundle.
  const onChannel = CHANNEL_DATA_BUILT && p.screen === "channel";

  return (
    <header className="relative z-30 flex min-h-header flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline px-3 py-1">
      {/* Mark only, no wordmark. role+label so it still has an accessible name. */}
      <div className="flex items-center pr-1" role="img" aria-label="Clipr">
        <BrandMark size={18} />
      </div>

      <CampaignChip menu={p.campaignMenu} />
      {!onChannel ? <SourceChip /> : <div className="flex-[1_1_0]" />}

      {/* spacer */}
      <div className="flex-1" />

      <nav aria-label="Tools" className="flex flex-wrap items-center gap-1">
        {onChannel && (
          <button type="button" className="link-quiet" onClick={() => p.onScreen?.("workspace")}>
            Back to clipping
          </button>
        )}
        <button
          type="button"
          id="ui-copy-blocks"
          className="link-quiet"
          aria-pressed={p.copyOpen}
          onClick={p.onToggleCopy}
          title="Copy blocks (⌘⇧C)"
        >
          <IconCopy />
          <span>Copy blocks</span>
        </button>
        <button
          type="button"
          id="ui-symbols"
          className="link-quiet"
          aria-pressed={p.symbolsOpen}
          onClick={p.onToggleSymbols}
          title="Symbols (⌘;)"
        >
          <IconSymbol />
          <span>Symbols</span>
        </button>
        {CHANNEL_DATA_BUILT && p.channelAvailable && !onChannel && (
          <button
            type="button"
            id="ui-channel-link"
            className="link-quiet"
            onClick={() => p.onScreen?.("channel")}
          >
            <IconChannel />
            <span>Channel data</span>
          </button>
        )}
      </nav>

      <YouTubeStatusChip />
      <UpdateStatus />

      <button
        type="button"
        id="ui-settings"
        className="icon-btn"
        aria-label="Settings"
        aria-expanded={p.settingsOpen}
        onClick={p.onToggleSettings}
        title="Settings (⌘,)"
      >
        <IconSettings />
      </button>

      {p.panelsMenu}

      {/* HELP: always the last item, top right, on every screen. */}
      <HelpButton open={p.helpOpen} onToggle={p.onToggleHelp} />
    </header>
  );
}
