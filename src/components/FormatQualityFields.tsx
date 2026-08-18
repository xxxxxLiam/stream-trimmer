/**
 * File: FormatQualityFields.tsx
 * Path: src/components/FormatQualityFields.tsx
 * Description: Format (mp4/mp3) and Quality selects; quality options swap by format.
 */
import { useClipperContext } from "../context/ClipperContext";
import { COOKIE_BROWSERS, type CookieBrowser } from "../lib/clip";
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

const BROWSER_LABELS: Record<CookieBrowser, string> = {
  chrome: "Chrome",
  safari: "Safari",
  edge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  chromium: "Chromium",
};

export default function FormatQualityFields() {
  const {
    info,
    format,
    setFormat,
    quality,
    setQuality,
    useBrowserCookies,
    setUseBrowserCookies,
    cookieBrowser,
    setCookieBrowser,
  } = useClipperContext();
  const qualityOptions =
    format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  const selectClass = "field appearance-none pr-8 cursor-pointer";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-fg-faint">
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
        <span className="text-[11px] uppercase tracking-wider text-fg-faint">
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

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={useBrowserCookies}
            onChange={(e) => setUseBrowserCookies(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Sign in via my browser for higher quality (optional)
        </label>

        {useBrowserCookies && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-fg-faint">
              Browser
            </span>
            <select
              value={cookieBrowser}
              onChange={(e) =>
                setCookieBrowser(e.target.value as CookieBrowser)
              }
              className={selectClass}
            >
              {COOKIE_BROWSERS.map((b) => (
                <option key={b} value={b}>
                  {BROWSER_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="text-[11px] leading-snug text-fg-faint">
          Uses your logged-in YouTube session to try for 1080p+ where available.
          Not all videos support higher quality. Your cookies are read directly
          by the downloader and never stored or sent anywhere.
        </p>
      </div>
    </div>
  );
}