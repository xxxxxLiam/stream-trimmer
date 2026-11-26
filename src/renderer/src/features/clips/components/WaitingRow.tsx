/**
 * File: WaitingRow.tsx
 * Path: src/renderer/src/features/clips/components/WaitingRow.tsx
 * Description: One moment waiting in Export: name, range · length, rating, topic and tier. The
 *   suggested next sits on an Ice edge. Clicking loads it on the timeline; the always-visible ⋯ opens the
 *   row in place with Clip now, Rename and Remove (the shared list row).
 */
import { useEffect, useState } from "react";
import ActionRow from "../../../shared/components/ActionRow";
import { IconCopy, IconMake, IconRemove, IconRename } from "../../../shared/components/rowIcons";
import { finishRename, renameKey } from "../../player/utils/laneRename";
import { DUPLICATE_NOTE, clipLength, type BankedClip } from "../../../shared/utils/bank";
import { formatLength } from "../../../shared/utils/segments";
import { boardTime, ratingText } from "../utils/exportRows";

const tierText = (tier: string) => (/^\d+$/.test(tier) ? `T${tier}` : tier);

export type WaitingRowProps = {
  clip: BankedClip;
  name: string;
  suggested: boolean;
  selected: boolean;
  onSelect: () => void;
  /** Already made: drawn dimmed with a Frost dot, as on the board; it can be loaded again but not remade here. */
  made?: boolean;
  /** One dim line when the length is under the campaign's minimum ("8 s under Acme's 0:30"). */
  lengthNote?: string;
  onMake: () => void;
  onRename: (name: string) => void;
  /** Copies just this clip (its line and its transcript range); true when it landed on the clipboard. */
  onCopy?: () => Promise<boolean>;
  onRemove: () => void;
  /** Select moments mode (board 03.2.51): the card shows a checkbox and a press ticks it. */
  picking?: { checked: boolean; onToggle: () => void };
};

const chip = "rounded-chip border border-hairlineStrong px-[4px] py-[1px] text-meta leading-[normal] text-fg-dim";
// A made row is dimmed the board's way (0.6) with the disabled token, not an opacity modifier (CLAUDE.md).
const madeChip = "rounded-chip border border-hairline px-[4px] py-[1px] text-meta leading-[normal] text-disabled";

export default function WaitingRow({ clip, name, suggested, selected, made, lengthNote, onSelect, onMake, onRename, onCopy, onRemove, picking }: WaitingRowProps) {
  const edge = suggested ? "border-ice-tint-50 bg-ice-tint-06" : selected ? "border-hairlineStrong" : "border-transparent";
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (!said) return;
    const t = window.setTimeout(() => setSaid(""), 3000);
    return () => window.clearTimeout(t);
  }, [said]);
  const copy = async () => setSaid((await onCopy?.()) ? "✓ Copied this clip with its transcript" : "Could not copy");
  const stop = () => {
    setDraft(null);
    setError(null);
  };
  const save = () => {
    const r = finishRename(draft ?? "", name);
    if (r.kind === "error") return setError(r.reason);
    if (r.kind === "save") onRename(r.name);
    stop();
  };
  const actions = [
    ...(made ? [] : [{ key: "clip", label: "Clip now", icon: <IconMake />, onSelect: onMake }]),
    ...(made ? [] : [{ key: "rename", label: "Rename", icon: <IconRename />, onSelect: () => setDraft(name) }]),
    ...(onCopy ? [{ key: "copy", label: "Copy as text", icon: <IconCopy />, onSelect: () => void copy() }] : []),
    { key: "remove", label: "Remove", icon: <IconRemove />, onSelect: onRemove, danger: true },
  ];
  return (
    <ActionRow id={`clip:${clip.id}`} name={name} actions={actions} className={`mx-[6px] my-[2px] border ${edge}`}>
      {draft !== null ? (
        <div className="px-[8px] py-[6px]">
          <input
            autoFocus
            value={draft}
            aria-label="Clip name"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              const k = renameKey(e.key);
              if (!k) return;
              e.preventDefault();
              if (k === "save") save();
              else stop();
            }}
            onBlur={() => {
              const r = finishRename(draft, name);
              if (r.kind === "save") onRename(r.name);
              stop();
            }}
            className="h-[28px] w-full rounded-chip border border-ice bg-raised px-[8px] text-body font-medium text-fg outline-none"
          />
          {error && (
            <div role="alert" className="mt-[4px] text-meta leading-[1.45] text-error">
              {error}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          aria-pressed={selected}
          onClick={picking ? picking.onToggle : onSelect}
          className="flex min-h-[47px] w-full items-center gap-[8px] rounded-control px-[8px] py-[6px] leading-[normal] text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
        >
          {picking ? (
            <span
              role="checkbox"
              aria-checked={picking.checked}
              aria-label={`Select ${name}`}
              className={`flex size-[16px] flex-none items-center justify-center rounded-chip border text-meta leading-[normal] ${picking.checked ? "border-ice text-ice" : "border-hairlineStrong"}`}
            >
              {picking.checked ? "✓" : ""}
            </span>
          ) : null}
          <span
            className={`size-[9px] flex-none rounded-[50%] border ${made ? "border-frost-tint-60 bg-frost-tint-60" : "border-fg-dim"}`}
            role="img"
            aria-label={made ? "Made" : "Waiting"}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-[8px]">
              <span className={`block min-w-0 truncate whitespace-nowrap text-body font-medium leading-[normal] ${made ? "text-disabled" : ""}`}>{name}</span>
              {clip.rating !== undefined && <span className={`flex-none text-meta font-semibold leading-[normal] ${made ? "text-disabled" : ""}`}>{ratingText(clip.rating)}</span>}
            </span>
            <span className="mt-[3px] flex items-center gap-[4px] whitespace-nowrap">
              {clip.category && <span className={made ? madeChip : chip}>{clip.category}</span>}
              {clip.tier && <span className={made ? madeChip : chip}>{tierText(clip.tier)}</span>}
              <span className={`text-meta leading-[normal] ${made ? "text-disabled" : "text-fg-dim"}`}>{formatLength(clipLength(clip))}</span>
            </span>
            {said && <span role="status" className="mt-[2px] block whitespace-nowrap text-meta leading-[normal] text-fg-dim">{said}</span>}
            {clip.note === DUPLICATE_NOTE && !made && <span className="mt-[2px] block whitespace-nowrap text-meta leading-[normal] text-fg-dim">{DUPLICATE_NOTE}</span>}
            {lengthNote && !made && <span className="mt-[2px] block whitespace-nowrap text-meta leading-[normal] text-fg-dim">{lengthNote}</span>}
            {clip.ranPastEnd !== undefined && !made && (
              <span className="mt-[2px] block whitespace-nowrap text-meta leading-[normal] text-fg-dim">Ran past the end; stops at {boardTime(clip.ranPastEnd)}</span>
            )}
          </span>
        </button>
      )}
    </ActionRow>
  );
}
