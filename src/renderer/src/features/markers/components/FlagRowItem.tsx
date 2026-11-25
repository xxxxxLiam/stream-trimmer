/**
 * File: FlagRowItem.tsx
 * Path: src/renderer/src/features/markers/components/FlagRowItem.tsx
 * Description: One flag in the Markers list: time and the words said there. Click opens it; the ✕ on
 *   hover (or Delete/Backspace on the focused row) removes the flag, and a range it was trimmed to is kept.
 */
import { IconClose } from "../../../shared/components/PanelIcons";
import RowIconButton from "../../../shared/components/RowIconButton";
import { formatClock } from "../../../shared/utils/clock";
import { isRemoveKey, type FlagRow } from "../utils/markers";

export type FlagRowItemProps = {
  row: FlagRow;
  onOpen: () => void;
  onRemove: () => void;
  grouped?: boolean;
};

export default function FlagRowItem({ row, onOpen, onRemove, grouped }: FlagRowItemProps) {
  const time = formatClock(row.at);
  return (
    <div
      onKeyDown={(e) => {
        if (!isRemoveKey(e.key)) return;
        e.preventDefault();
        onRemove();
      }}
      className={
        "group flex min-h-target items-center " +
        (grouped
          ? "w-full border-t border-hairline"
          : "mx-[10px] mb-[6px] w-[calc(100%-20px)] rounded-control bg-raised")
      }
    >
      <button
        type="button"
        aria-label={`Flag at ${time}${row.words ? `: ${row.words}` : ""}`}
        onClick={onOpen}
        className="flex min-w-[0px] flex-1 items-baseline self-stretch gap-[10px] px-[10px] py-[8px] text-left text-body text-fg"
      >
        <span className="flex-none text-meta leading-[1.35] tabular-nums [font-feature-settings:'tnum'] text-fg-dim">{time}</span>
        <span className="leading-[1.35]">{row.words}</span>
      </button>
      <span className="mr-[4px] hidden flex-none group-focus-within:flex group-hover:flex">
        <RowIconButton label="Remove flag" onClick={onRemove}>
          <IconClose />
        </RowIconButton>
      </span>
    </div>
  );
}
