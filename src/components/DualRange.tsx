/**
 * File: DualRange.tsx
 * Path: src/components/DualRange.tsx
 * Description: Overlaid dual-handle range slider with a shared selected fill.
 */
interface DualRangeProps {
  min: number;
  max: number;
  start: number;
  end: number;
  onStart: (value: number) => void;
  onEnd: (value: number) => void;
  disabled?: boolean;
}

export default function DualRange({
  min,
  max,
  start,
  end,
  onStart,
  onEnd,
  disabled,
}: DualRangeProps) {
  const span = max - min || 1;
  const leftPct = ((start - min) / span) * 100;
  const rightPct = ((end - min) / span) * 100;

  return (
    <div
      className={`relative flex h-7 items-center ${disabled ? "opacity-60" : ""}`}
    >
      <div className="absolute inset-x-0 h-0.5 bg-neutral-700" />
      <div
        className="absolute h-0.5 bg-white"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
      />
      <input
        type="range"
        aria-label="Start time"
        className="dual-input absolute left-0 m-0 w-full"
        min={min}
        max={max}
        step={1}
        value={start}
        disabled={disabled}
        onChange={(e) => onStart(Number(e.target.value))}
      />
      <input
        type="range"
        aria-label="End time"
        className="dual-input absolute left-0 m-0 w-full"
        min={min}
        max={max}
        step={1}
        value={end}
        disabled={disabled}
        onChange={(e) => onEnd(Number(e.target.value))}
      />
    </div>
  );
}