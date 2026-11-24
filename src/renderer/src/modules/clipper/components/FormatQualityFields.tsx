/**
 * File: FormatQualityFields.tsx
 * Path: src/renderer/src/modules/clipper/components/FormatQualityFields.tsx
 * Description: Format (mp4/mp3) and Quality selects; quality options swap by format.
 */
import { useClipperContext } from "../hooks/ClipperContext";
import { AUDIO_QUALITIES, VIDEO_QUALITIES } from "../hooks/useClipperController";
import { QUALITY_LABELS } from "../utils/clipperTypes";

export default function FormatQualityFields() {
  const { info, format, setFormat, quality, setQuality } = useClipperContext();
  const qualityOptions =
    format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  const selectClass = "field appearance-none pr-8 cursor-pointer";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-meta uppercase tracking-wider text-fg-dim">
          Format
        </span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as "mp4" | "mp3")}
          disabled={!info}
          className={selectClass}
        >
          <option value="mp4">MP4 (video)</option>
          <option value="mp3">MP3 (audio)</option>
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-meta uppercase tracking-wider text-fg-dim">
          Quality
        </span>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          disabled={!info}
          className={selectClass}
        >
          {qualityOptions.map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABELS[q] || q}
            </option>
          ))}
        </select>
      </label>
      </div>
    </div>
  );
}
