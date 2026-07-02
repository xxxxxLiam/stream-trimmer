/**
 * File: TimeRangeControls.tsx
 * Path: src/components/TimeRangeControls.tsx
 * Description: HH:MM:SS start/end fields with Paste buttons plus the dual-range slider.
 */
import { Clipboard } from "react-bootstrap-icons";
import DualRange from "./DualRange";
import { useClipperContext } from "../context/ClipperContext";
import { formatTimestamp } from "../lib/clip";

function TimestampField({
  label,
  value,
  onChange,
  onPaste,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPaste: () => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-fg-faint">
        {label}
      </span>
      <div className="group flex items-center rounded-row border border-hairline bg-panel-raised transition-colors focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgba(255,99,99,0.18)]">
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-fg outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onPaste}
          disabled={disabled}
          className="mr-1 flex items-center rounded-chip px-2 py-1 text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={`Paste ${label.toLowerCase()}`}
        >
          <Clipboard size={12} />
        </button>
      </div>
    </label>
  );
}

export default function TimeRangeControls() {
  const {
    info,
    duration,
    startText,
    setStartText,
    endText,
    setEndText,
    start,
    end,
    setStartFromSeconds,
    setEndFromSeconds,
    pasteInto,
  } = useClipperContext();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <TimestampField
          label="Start"
          value={startText}
          onChange={setStartText}
          onPaste={() => pasteInto(setStartText)}
          placeholder="00:00:00"
          disabled={!info}
        />
        <TimestampField
          label="End"
          value={endText}
          onChange={setEndText}
          onPaste={() => pasteInto(setEndText)}
          placeholder={info ? formatTimestamp(duration) : "00:00:00"}
          disabled={!info}
        />
      </div>

      <div className="flex flex-col gap-2">
        <DualRange
          min={0}
          max={duration || 1}
          start={start}
          end={end}
          onStart={setStartFromSeconds}
          onEnd={setEndFromSeconds}
          disabled={!info}
        />
        <div className="flex justify-between text-[12px] text-fg-muted tabular-nums">
          <span>{formatTimestamp(start)}</span>
          <span className="text-accent">
            {formatTimestamp(end - start)} selected
          </span>
          <span>{formatTimestamp(end)}</span>
        </div>
      </div>
    </div>
  );
}