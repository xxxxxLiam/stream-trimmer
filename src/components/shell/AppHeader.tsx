/**
 * File: AppHeader.tsx
 * Path: src/components/shell/AppHeader.tsx
 * Description: 48px header (BUILD-SPEC section 3): mark, campaign chip, source chip,
 *   spacer, subordinate links, settings, and HELP always last.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useClipperContext } from "../../context/ClipperContext";
import { useIsTabActive } from "../../context/WorkspaceContext";
import UrlBar from "../UrlBar";
import YouTubeStatusChip from "../YouTubeStatusChip";
import UpdateStatus from "../UpdateStatus";
import { formatTimestamp } from "../../lib/clip";
import BrandMark from "./BrandMark";
import CampaignChip from "./CampaignChip";
import HelpButton from "./HelpButton";
import { IconChannel, IconCopy, IconSettings, IconSymbol } from "./icons";
import { useDismiss } from "./useDismiss";

export type AppHeaderProps = {
  screen: "workspace" | "channel";
  /** Switch screens. The channel exporter is its own screen, not a peer tab. */
  onScreen: (s: "workspace" | "channel") => void;
  /** Show the Channel data link. False when the feature is compiled/locked out. */
  channelAvailable: boolean;
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
  /** Body of the settings popover. */
  settingsBody?: ReactNode;
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
  const settingsRef = useRef<HTMLDivElement>(null);
  useDismiss(settingsRef, p.settingsOpen, p.onCloseSettings);

  return (
    <header className="relative z-30 flex min-h-header flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline px-3 py-1">
      <div className="flex items-center gap-2 pr-1" aria-label="Clipper">
        <BrandMark size={18} />
        <span className="text-section">Clipper</span>
      </div>

      <CampaignChip menu={p.campaignMenu} />
      {p.screen === "workspace" ? <SourceChip /> : <div className="flex-[1_1_0]" />}

      {/* spacer */}
      <div className="flex-1" />

      <nav aria-label="Tools" className="flex flex-wrap items-center gap-1">
        {p.screen === "channel" && (
          <button type="button" className="link-quiet" onClick={() => p.onScreen("workspace")}>
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
        {p.channelAvailable && p.screen === "workspace" && (
          <button
            type="button"
            id="ui-channel-link"
            className="link-quiet"
            onClick={() => p.onScreen("channel")}
          >
            <IconChannel />
            <span>Channel data</span>
          </button>
        )}
      </nav>

      <YouTubeStatusChip />
      <UpdateStatus />

      <div ref={settingsRef} className="relative">
        <button
          type="button"
          id="ui-settings"
          className="icon-btn"
          aria-label="Settings"
          aria-expanded={p.settingsOpen}
          aria-haspopup="dialog"
          onClick={p.onToggleSettings}
          title="Settings (⌘,)"
        >
          <IconSettings />
        </button>
        {p.settingsOpen && (
          <div
            role="dialog"
            aria-label="Settings"
            className="popover absolute right-0 top-full z-40 mt-1 w-[280px]"
          >
            {p.settingsBody ?? (
              // TODO(Phase C): settings content (campaign editing lives in B4).
              <p className="text-meta text-fg-dim">No app settings yet.</p>
            )}
          </div>
        )}
      </div>

      {/* HELP: always the last item, top right, on every screen. */}
      <HelpButton open={p.helpOpen} onToggle={p.onToggleHelp} />
    </header>
  );
}
