/**
 * File: ExportBar.tsx
 * Path: src/renderer/src/features/player/components/ExportBar.tsx
 * Description: The one export bar, fixed full-bleed at the very bottom of the window (60px, panel fill, a
 *   strong hairline on top, no margin, no radius). Left: In, Out, the clip length and one chip per section.
 *   Centre: only the "at 360p · Sign in for 1080p" notice. Where clips go and Audio live in the Clip arrow's menu.
 *   Right: + section and the split Clip button. It is not a panel and nothing in it moves.
 */
import { X } from "react-bootstrap-icons";
import { findOverlaps } from "../../../shared/utils/segments";
import type { AudioTrackInfo } from "../../../shared/utils/audioLanguages";
import { lengthLabel } from "../hooks/useTimelineController";
import { useTimelineView } from "../hooks/TimelineControllerContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { lengthVerdict, ruleOf } from "../../../shared/utils/lengthRule";
import ClipButton from "./ClipButton";
import InOutFields from "./InOutFields";

const VALUE_BUTTON = "inline-flex h-[44px] items-center";

export type ExportBarProps = {
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
    <X width={12} height={12} aria-hidden="true" focusable="false" />
  );
}

export default function ExportBar({
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
  return (
    <div id="ui-export-bar" className="flex h-[60px] shrink-0 items-center gap-[16px] border-t border-hairlineStrong bg-panel px-[16px] text-meta text-fg-dim">
      <div className="flex min-w-0 flex-1 items-center gap-[16px] overflow-hidden whitespace-nowrap text-fg">
        {chips.length === 0 ? (
          <InOutFields />
        ) : null}
        <span id="ui-stitched-total" className="inline-flex items-baseline gap-[8px]">
          <span className={`text-cliplength tabular-nums ${c.lengthText === "—" ? "text-fg-dim" : verdict.state === "out" ? "text-fg" : "text-ice"}`}>{c.lengthText}</span>
          <span className={`text-meta leading-[15px] ${verdict.state === "out" ? "text-fg" : "text-fg-dim"}`}>{verdict.label}</span>
        </span>
        {chips.length === 0 && c.inText === "—" && c.outText === "—" ? <span className="text-meta text-fg-dim">Type or paste a time</span> : null}
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
        {at360 ? <span className="text-error">at 360p</span> : null}
        {showSignInPill ? (
          <button type="button" id="ui-sign-in-pill" aria-label="Sign in for 1080p: opens Settings" className={`${VALUE_BUTTON} group`} onClick={onSignIn}>
            <span className="inline-flex h-[28px] items-center whitespace-nowrap rounded-[14px] border border-ice px-[12px] text-meta font-medium text-ice group-hover:bg-ice-tint-12">
              Sign in for 1080p
            </span>
          </button>
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
        <ClipButton listenForKey openUp options={{ folder, onPickFolder, tracks, selectedLanguages, onSelectLanguages }} />
      </span>
    </div>
  );
}
