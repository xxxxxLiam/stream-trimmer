/**
 * File: WaitingRow.tsx
 * Path: src/renderer/src/features/clips/components/WaitingRow.tsx
 * Description: One moment waiting in Export: name, range · length, rating, topic and tier. The
 *   suggested next sits on an Ice edge. Clicking loads it on the timeline; hover or focus reveals
 *   Make and Remove.
 */
import RowIconButton from "../../../shared/components/RowIconButton";
import { IconMake, IconRemove } from "../../../shared/components/rowIcons";
import type { BankedClip } from "../../../shared/utils/bank";
import { rangeLine, ratingText } from "../utils/exportRows";

const tierText = (tier: string) => (/^\d+$/.test(tier) ? `T${tier}` : tier);

export type WaitingRowProps = {
  clip: BankedClip;
  name: string;
  suggested: boolean;
  selected: boolean;
  onSelect: () => void;
  /** Already made: drawn dimmed with a Frost dot, as on the board; it can be loaded again but not remade here. */
  made?: boolean;
  onMake: () => void;
  onRemove: () => void;
};

const chip = "rounded-chip border border-hairlineStrong px-[5px] py-[1px] text-meta leading-[normal] text-fg-dim";

export default function WaitingRow({ clip, name, suggested, selected, made, onSelect, onMake, onRemove }: WaitingRowProps) {
  const edge = suggested ? "border-ice-tint-50 bg-ice-tint-06" : selected ? "border-hairlineStrong" : "border-transparent";
  return (
    <div className={`group relative mx-[6px] my-[2px] ${made ? "opacity-60" : ""}`}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`flex min-h-[47px] w-full items-center gap-[8px] rounded-control border px-[8px] py-[6px] leading-[normal] text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost ${edge}`}
      >
        <span
          className={`size-[9px] flex-none rounded-full border ${made ? "border-frost bg-frost" : "border-fg-dim"}`}
          role="img"
          aria-label={made ? "Made" : "Waiting"}
        />
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-body font-medium leading-[normal]">{name}</span>
          <span className="mt-[2px] block whitespace-nowrap text-meta leading-[normal] text-fg-dim">{rangeLine(clip)}</span>
        </span>
        <span className="ml-auto flex items-center gap-[3px]">
          {clip.rating !== undefined && <span className="text-meta font-semibold leading-[normal]">{ratingText(clip.rating)}</span>}
          {clip.category && <span className={chip}>{clip.category}</span>}
          {clip.tier && <span className={chip}>{tierText(clip.tier)}</span>}
        </span>
      </button>
      <span className="absolute right-[4px] top-1/2 hidden -translate-y-1/2 gap-[4px] rounded-control bg-raised group-focus-within:flex group-hover:flex">
        {!made && (
          <RowIconButton label="Make this clip" onClick={onMake}>
            <IconMake />
          </RowIconButton>
        )}
        <RowIconButton label="Remove from this video" onClick={onRemove}>
          <IconRemove />
        </RowIconButton>
      </span>
    </div>
  );
}
