/**
 * File: ExportBar.tsx
 * Path: src/renderer/src/features/player/components/ExportBar.tsx
 * Description: The one export bar, fixed full-bleed at the very bottom of the window (60px, panel fill, a
 *   strong hairline on top, no margin, no radius). Left: In, Out, the clip length and one chip per section.
 *   Centre: the sentence that says what the next Clip makes ("Makes 2 clips [Original + ES] to [folder]").
 *   Right: + section and the split Clip button. It is not a panel and nothing in it moves.
 */
import { useState } from "react";
import PopoverMenu, { type MenuItem } from "../../../modules/layout/components/PopoverMenu";
import { IconChevronSmall } from "../../../modules/layout/components/BarIcons";
import { useNextClipName } from "../../../modules/layout/hooks/useNextClipName";
import { findOverlaps } from "../../../shared/utils/segments";
import {
  audioButtonLabel,
  makesText,
  nameForLanguage,
  planLanguages,
  shortenPath,
  toggleLanguage,
  type AudioTrackInfo,
} from "../../../shared/utils/audioLanguages";
import { lengthLabel } from "../hooks/useTimelineController";
import { useTimelineView } from "../hooks/TimelineControllerContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { lengthVerdict, ruleOf } from "../../../shared/utils/lengthRule";
import ClipButton from "./ClipButton";

const VALUE_BUTTON = "inline-flex h-[44px] items-center";
const VALUE_FACE =
  "inline-flex h-[30px] items-center gap-[6px] rounded-control border border-hairlineStrong bg-raised px-[10px] text-meta text-fg";

export type ExportBarProps = {
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

function CrossIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export default function ExportBar({
  clipCount,
  tracks,
  selectedLanguages,
  onSelectLanguages,
  folder,
  onPickFolder,
  at360,
  showSignInPill,
  onSignIn,
}: ExportBarProps) {
  const c = useTimelineView();
  const { active } = useCampaign();
  const verdict = lengthVerdict(c.totalSeconds, ruleOf(active), active?.name ?? "");
  const chips = c.segments;
  const overlap = c.range ? findOverlaps(c.range, c.used).length > 0 : false;
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
    <div id="ui-export-bar" className="flex h-[60px] shrink-0 items-center gap-[16px] border-t border-hairlineStrong bg-panel px-[16px] text-meta text-fg-dim">
      <div className="flex min-w-0 flex-1 items-center gap-[16px] overflow-hidden whitespace-nowrap text-fg">
        {chips.length === 0 ? (
          <>
            <span id="ui-mark-in" className={`text-section font-normal tabular-nums ${c.inText === "—" ? "text-fg-dim" : ""}`} aria-label={c.inText === "—" ? "No start" : "In"}>
              {c.inText}
            </span>
            <span id="ui-mark-out" className={`text-section font-normal tabular-nums ${c.outText === "—" ? "text-fg-dim" : ""}`} aria-label={c.outText === "—" ? "No end" : "Out"}>
              {c.outText}
            </span>
          </>
        ) : null}
        <span id="ui-stitched-total" className="inline-flex items-baseline gap-[8px]">
          <span className={`text-cliplength tabular-nums ${c.lengthText === "—" ? "text-fg-dim" : verdict.state === "out" ? "text-fg" : "text-ice"}`}>{c.lengthText}</span>
          <span className={`text-meta leading-[15px] ${verdict.state === "out" ? "text-fg" : "text-fg-dim"}`}>{verdict.label}</span>
        </span>
        {overlap ? (
          <span id="ui-overlap-warning" role="status" className="text-meta text-fg-dim">
            Overlaps a clip already made
          </span>
        ) : null}
        {chips.length > 0 ? (
          <span id="ui-segment-list" className="sr-only">
            {chips.length} sections
          </span>
        ) : null}
        {chips.map((s, i) => (
          <span
            key={`${s.start}-${s.end}`}
            className="inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-[15px] border border-ice-tint-50 pl-[12px] pr-[4px] text-body"
          >
            <span className="text-fg-dim">{i + 1}</span>
            <span className="tabular-nums">{lengthLabel(s.end - s.start)}</span>
            <button
              type="button"
              aria-label={`Remove section ${i + 1}`}
              disabled={c.locked}
              onClick={() => c.removeSection(i)}
              className="inline-flex size-[28px] items-center justify-center text-fg-dim hover:text-fg"
            >
              <CrossIcon />
            </button>
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-[8px] whitespace-nowrap" id="ui-export-sentence">
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
          <button type="button" id="ui-sign-in-pill" aria-label="Sign in for 1080p: opens Settings" className={`${VALUE_BUTTON} group`} onClick={onSignIn}>
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

      <span className="flex min-w-0 flex-1 items-center justify-end gap-[8px]">
        <button
          type="button"
          disabled={!c.range || c.locked}
          onClick={c.addSection}
          id="ui-add-segment"
          className="h-target shrink-0 rounded-full border border-hairlineStrong bg-raised px-[16px] text-body text-fg disabled:text-disabled"
        >
          + section
        </button>
        <ClipButton listenForKey openUp />
      </span>
    </div>
  );
}
