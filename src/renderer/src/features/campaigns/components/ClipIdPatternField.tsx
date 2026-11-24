/**
 * File: ClipIdPatternField.tsx
 * Path: src/renderer/src/features/campaigns/components/ClipIdPatternField.tsx
 * Description: How a clip is named, chosen from ready-made examples instead of typed as tokens.
 *   Each choice is shown as a real name built from the campaign's own code and a sample video.
 *   "Advanced / custom…" reveals the old text box, so a hand-written pattern is never lost.
 *   Shared by the campaign form and the new-campaign wizard.
 */
import { useId, useState } from "react";
import {
  CLIP_ID_PRESETS,
  clipIdExample,
  defaultPrefix,
  presetForPattern,
} from "../../../shared/utils/campaigns";

const CUSTOM = "__custom__";

export default function ClipIdPatternField({
  pattern,
  prefix,
  campaignName = "",
  onChange,
}: {
  pattern: string;
  /** The campaign's client code as typed; blank falls back to the one made from the name. */
  prefix: string;
  campaignName?: string;
  onChange: (pattern: string) => void;
}) {
  const id = useId();
  // A pattern that is not one of the ready-made ones opens in custom mode so it stays visible.
  const [custom, setCustom] = useState(() => !presetForPattern(pattern));
  const shownPrefix = prefix.trim() || (campaignName.trim() ? defaultPrefix(campaignName) : "XX");
  const preset = presetForPattern(pattern);
  const selected = custom ? CUSTOM : (preset?.id ?? CUSTOM);
  const example = clipIdExample(pattern || CLIP_ID_PRESETS[0].pattern, shownPrefix);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-w-0 flex-col gap-1" htmlFor={id}>
        <span className="text-meta text-fg-dim">How clips are named</span>
        <select
          id={id}
          className="field font-mono"
          value={selected}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              return;
            }
            const next = CLIP_ID_PRESETS.find((p) => p.id === e.target.value);
            if (next) {
              setCustom(false);
              onChange(next.pattern);
            }
          }}
        >
          {CLIP_ID_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {clipIdExample(p.pattern, shownPrefix)} ({p.parts})
            </option>
          ))}
          <option value={CUSTOM}>Advanced / custom…</option>
        </select>
      </label>
      {!custom && preset?.note && <p className="m-0 text-meta text-fg-dim">{preset.note}</p>}
      {custom && (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-meta text-fg-dim">Your own naming pattern</span>
          <input
            className="field font-mono"
            value={pattern}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${id}-help`}
          />
          <span id={`${id}-help`} className="text-meta text-fg-dim">
            Build it from {"{prefix}"} (client code), {"{videoId}"} (video code), {"{nn}"} (01, 02,
            03) and {"{n}"} (1, 2, 3). It must include {"{nn}"} or {"{n}"}.
          </span>
        </label>
      )}
      <p className="m-0 text-meta text-fg-dim">
        Next clip looks like <span className="font-mono text-fg">{example}</span>
      </p>
    </div>
  );
}
