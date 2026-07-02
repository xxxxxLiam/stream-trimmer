/**
 * File: FormatQualityFields.tsx
 * Path: src/components/FormatQualityFields.tsx
 * Description: Format (mp4/mp3) and Quality selects; quality options swap by format.
 */
import { useClipperContext } from "../context/ClipperContext";
import {
  AUDIO_QUALITIES,
  VIDEO_QUALITIES,
} from "../hooks/useClipper";

const QUALITY_LABELS: Record<string, string> = {
  best: "Best",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
  "320": "320 kbps",
  "192": "192 kbps",
  "128": "128 kbps",
};

export default function FormatQualityFields() {
  const { info, format, setFormat, quality, setQuality } = useClipperContext();
  const qualityOptions =
    format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  const selectClass =
    "w-full border border-white bg-black px-3 py-2.5 text-white outline-none disabled:opacity-50";

  return (
    <div className="flex gap-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wider opacity-80">
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
        <span className="text-xs uppercase tracking-wider opacity-80">
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
  );
}