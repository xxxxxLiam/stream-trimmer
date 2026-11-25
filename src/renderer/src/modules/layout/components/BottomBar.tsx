/**
 * File: BottomBar.tsx
 * Path: src/renderer/src/modules/layout/components/BottomBar.tsx
 * Description: The full-width bottom bar (board 03.2.1): the timeline tools on the left, the
 *   sentence that says what the next Clip makes in the middle ("Makes 2 clips [Original + ES] to
 *   [~/Clips/Acme]"), and zoom with Fit on the right. Logic-free: the screen passes what to show.
 *   Spec: plans/export-footer-plan.md. The tools are shared state (useToolState) the timeline reads.
 */
import { useState, type ReactElement } from "react";
import PopoverMenu, { type MenuItem } from "./PopoverMenu";
import {
  IconChevronSmall,
  IconFlag,
  IconHand,
  IconPointer,
  IconScissors,
  IconZoomTool,
} from "./BarIcons";
import { useNextClipName } from "../hooks/useNextClipName";
import { useToolState, type TimelineTool } from "../hooks/useToolState";
import {
  audioButtonLabel,
  makesText,
  nameForLanguage,
  planLanguages,
  shortenPath,
  toggleLanguage,
  type AudioTrackInfo,
} from "../../../shared/utils/audioLanguages";

const TOOLS: { tool: TimelineTool; label: string; icon: () => ReactElement }[] = [
  { tool: "pointer", label: "Pointer", icon: IconPointer },
  { tool: "clip", label: "Clip tool", icon: IconScissors },
  { tool: "flag", label: "Flag (M)", icon: IconFlag },
  { tool: "hand", label: "Hand", icon: IconHand },
  { tool: "zoom", label: "Zoom tool", icon: IconZoomTool },
];

const VALUE_BUTTON = "inline-flex h-[44px] items-center";
const VALUE_FACE =
  "inline-flex h-[30px] items-center gap-[6px] rounded-control border border-hairlineStrong bg-raised px-[10px] text-meta text-fg";

export type BottomBarProps = {
  /** How many clips the next Clip makes (one per ticked language). */
  clipCount: number;
  /** The video's audio tracks. The Audio button shows only when there is a dub besides the original. */
  tracks?: AudioTrackInfo[];
  /** Ticked languages, as stored. */
  selectedLanguages?: string[];
  onSelectLanguages: (next: string[]) => void;
  /** The campaign's clips folder (full path). */
  folder: string;
  /** Opens the folder picker. Absent in the browser, where the folder cannot be chosen. */
  onPickFolder?: () => void | Promise<unknown>;
  /** Requests go out signed out, so clips are 360p. */
  at360?: boolean;
  /** Offer "Sign in for 1080p" (no browser sign-in works). */
  showSignInPill?: boolean;
  onSignIn?: () => void;
};

export default function BottomBar({
  clipCount,
  tracks,
  selectedLanguages,
  onSelectLanguages,
  folder,
  onPickFolder,
  at360,
  showSignInPill,
  onSignIn,
}: BottomBarProps) {
  const { tool, setTool, zoom, setZoom, zoomBy, fit } = useToolState();
  const hasDubs = !!tracks && tracks.some((t) => t.kind !== "original");
  const [problem, setProblem] = useState("");

  const clipName = useNextClipName();
  const plans = planLanguages(tracks, selectedLanguages);
  const audioItems: MenuItem[] = [
    ...(tracks ?? []).map<MenuItem>((t) => {
      const ticked = t.kind === "original" ? !(selectedLanguages ?? []).includes(`-${t.language}`) : (selectedLanguages ?? []).includes(t.language);
      return {
        key: t.language,
        label: t.kind === "original" ? "Original" : t.label,
        detail: t.kind === "original" ? t.label : t.kind === "auto-dubbed" ? "Auto-dubbed" : "Creator dub",
        checked: ticked,
        keepOpen: true,
        onSelect: () => onSelectLanguages(toggleLanguage(tracks ?? [], selectedLanguages, t.language)),
      };
    }),
    ...(clipName
      ? ([
          { kind: "separator", key: "sep-note" },
          { kind: "note", key: "note", label: `${makesText(plans.length)}: ${plans.map((p) => nameForLanguage(clipName, p)).join(", ")}` },
        ] as MenuItem[])
      : []),
  ];

  return (
    <div className="relative mx-[8px] mb-[3px] mt-[8px] flex h-[54px] shrink-0 items-center rounded-panel border border-hairline bg-raised px-[6px] text-meta text-fg-dim">
      <div role="toolbar" aria-label="Timeline tools" className="flex">
        {TOOLS.map(({ tool: t, label, icon: IconFor }) => (
          <button
            key={t}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            className={`inline-flex h-[44px] w-[40px] shrink-0 items-center justify-center rounded-control ${
              tool === t ? "bg-bg text-ice" : "text-fg-dim hover:bg-hover hover:text-fg"
            }`}
          >
            <IconFor />
          </button>
        ))}
      </div>

      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[8px] whitespace-nowrap" id="ui-export-sentence">
        <span>{makesText(clipCount)}</span>
        {hasDubs ? (
          <PopoverMenu
            label={`Audio: ${audioButtonLabel(tracks!, selectedLanguages)}`}
            items={audioItems}
            side="above"
            align="center"
            menuWidth={290}
            boxes
            triggerClassName={VALUE_BUTTON}
            pressedWhenOpen={false}
            heading="Audio languages"
          >
            <span className={VALUE_FACE}>
              {audioButtonLabel(tracks!, selectedLanguages)}
              <IconChevronSmall />
            </span>
          </PopoverMenu>
        ) : null}
        <span>to</span>
        <button
          type="button"
          id="ui-footer-clips"
          className={VALUE_BUTTON}
          aria-label={`Clips folder: ${folder || "not set"}`}
          title={onPickFolder ? folder || "Choose a folder" : "Browser downloads go to your Downloads folder. Use the desktop app to choose a folder."}
          aria-disabled={!onPickFolder}
          onClick={async () => {
            if (!onPickFolder) return;
            const r = await onPickFolder();
            setProblem(typeof r === "string" ? r : "");
          }}
        >
          <span className={`${VALUE_FACE} ${onPickFolder ? "" : "text-disabled"}`}>
            {folder ? shortenPath(folder) : "Choose a folder"}
            <IconChevronSmall />
          </span>
        </button>
        {at360 ? <span className="text-error">at 360p</span> : null}
        {showSignInPill ? (
          <button
            type="button"
            id="ui-sign-in-pill"
            aria-label="Sign in for 1080p: opens Help"
            className={`${VALUE_BUTTON} group`}
            onClick={onSignIn}
          >
            <span className="inline-flex h-[28px] items-center whitespace-nowrap rounded-[14px] border border-ice px-[12px] text-meta font-medium text-ice group-hover:bg-ice-tint-12">
              Sign in for 1080p
            </span>
          </button>
        ) : null}
        {problem ? (
          <span role="alert" className="text-error">
            {problem}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-[2px]">
        <button
          type="button"
          aria-label="Zoom out"
          className="inline-flex h-[44px] w-[32px] items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg"
          onClick={() => zoomBy(-10)}
        >
          −
        </button>
        <span
          role="slider"
          aria-label="Timeline zoom"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={zoom}
          tabIndex={0}
          className="relative mx-[6px] h-[3px] w-[96px] rounded-[2px] bg-hover"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 25 : 10;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") setZoom(zoom + step);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setZoom(zoom - step);
            else if (e.key === "Home") setZoom(0);
            else if (e.key === "End") setZoom(100);
            else return;
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom(((e.clientX - r.left) / r.width) * 100);
          }}
        >
          <span
            aria-hidden
            className="absolute -top-[5px] size-[13px] -translate-x-1/2 rounded-full bg-fg"
            style={{ left: `${zoom}%` }}
          />
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          className="inline-flex h-[44px] w-[32px] items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg"
          onClick={() => zoomBy(10)}
        >
          +
        </button>
        <button type="button" className="inline-flex h-[44px] items-center rounded-control px-[10px] text-meta text-fg-dim hover:bg-hover hover:text-fg" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}
