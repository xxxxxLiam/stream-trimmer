/**
 * File: ClipNameField.tsx
 * Path: src/renderer/src/features/player/components/ClipNameField.tsx
 * Description: The clip's name on the Clips lane. A button: double-click or Enter edits it in place,
 *   Enter saves, Esc cancels, and a name the naming rule refuses shows its plain error under it.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { finishRename, renameKey } from "../utils/laneRename";

type Props = {
  name: string;
  onRename: (name: string) => void;
  className: string;
  style: CSSProperties;
};

export default function ClipNameField({ name, onRename, className, style }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    setError(null);
    setDraft(name);
  };
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

  if (!editing) {
    return (
      <button
        type="button"
        title={`${name}. Double-click or press Enter to rename`}
        aria-label={`${name}, rename`}
        onDoubleClick={start}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            start();
          }
        }}
        className={className}
        style={style}
      >
        {name}
      </button>
    );
  }
  return (
    <>
      <input
        ref={input}
        value={draft ?? ""}
        aria-label="Clip name"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          const k = renameKey(e.key);
          if (!k) return;
          e.preventDefault();
          if (k === "save") save();
          else stop();
        }}
        onBlur={() => {
          // Leaving the field saves a valid name and drops one the rule refuses.
          const r = finishRename(draft ?? "", name);
          if (r.kind === "save") onRename(r.name);
          stop();
        }}
        className="absolute top-[5px] h-[24px] rounded-chip border border-ice bg-raised px-[8px] text-center text-meta font-medium leading-[22px] text-fg outline-none"
        style={{ ...style, minWidth: 140 }}
      />
      {error ? (
        <span
          role="alert"
          className="absolute top-[32px] z-20 max-w-[320px] rounded-chip border border-error bg-raised px-[8px] py-[4px] text-meta leading-[16px] text-error"
          style={{ left: style.left }}
        >
          {error}
        </span>
      ) : null}
    </>
  );
}
