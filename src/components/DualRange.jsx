export default function DualRange({
  min,
  max,
  start,
  end,
  onStart,
  onEnd,
  disabled,
}) {
  const span = max - min || 1;
  const leftPct = ((start - min) / span) * 100;
  const rightPct = ((end - min) / span) * 100;

  return (
    <div className={`dual-range${disabled ? " is-disabled" : ""}`}>
      <div className="dual-track">
        <div
          className="dual-selected"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
      </div>
      <input
        type="range"
        aria-label="Start time"
        className="dual-input dual-input-start"
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
        className="dual-input dual-input-end"
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
