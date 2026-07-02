/**
 * File: TimeRangeControls.tsx
 * Path: src/components/TimeRangeControls.tsx
 * Description: HH:MM:SS start/end fields with Paste buttons plus the dual-range slider.
 */
import { BsClipboard } from "react-bootstrap-icons";
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
      <span className="text-xs uppercase tracking-wider opacity-80">
        {label}
      </span>
      <div className="flex items-stretch border border-white">
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 bg-black px-3 py-2.5 outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onPaste}
          disabled={disabled}
          className="flex items-center border-l border-white px-3 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-white"
          aria-label={`Paste ${label.toLowerCase()}`}
        >
          <BsClipboard />
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
        <div className="flex justify-between opacity-80">
          <span>{formatTimestamp(start)}</span>
          <span>{formatTimestamp(end - start)} selected</span>
          <span>{formatTimestamp(end)}</span>
        </div>
      </div>
    </div>
  );
}