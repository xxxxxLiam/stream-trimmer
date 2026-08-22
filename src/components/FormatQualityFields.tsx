/**
 * File: FormatQualityFields.tsx
 * Path: src/components/FormatQualityFields.tsx
 * Description: Format (mp4/mp3) and Quality selects; quality options swap by format.
 * Includes the optional guided YouTube sign-in (browser cookie) controls.
 */
import {
  ArrowRepeat,
  BoxArrowUpRight,
  CheckCircleFill,
  ExclamationTriangleFill,
  PersonCircle,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { COOKIE_BROWSERS, type CookieBrowser } from "../lib/clip";
import { AUDIO_QUALITIES, VIDEO_QUALITIES } from "../hooks/useClipper";

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

/** Status line shown under the sign-in button, keyed by probe state. */
function SignInStatus() {
  const { ytAuth, checkYouTubeAuth } = useClipperContext();

  switch (ytAuth.status) {
    case "checking":
      return (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          <ArrowRepeat className="animate-spin" size={12} />
          Waiting for sign-in… finish it in your browser.
        </p>
      );
    case "signed_in":
      return (
        <p className="flex items-center gap-1.5 text-xs text-accent">
          <CheckCircleFill size={12} />
          Signed in — higher quality will be tried on your next download.
        </p>
      );
    case "unreadable":
      return (
        <p className="flex items-start gap-1.5 text-xs text-amber-400">
          <ExclamationTriangleFill size={12} className="mt-0.5 shrink-0" />
          <span>{ytAuth.message}</span>
        </p>
      );
    case "signed_out":
    case "unknown":
      return (
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <ExclamationTriangleFill
              size={12}
              className="mt-0.5 shrink-0 text-fg-faint"
            />
            <span>{ytAuth.message ?? "No sign-in detected yet."}</span>
          </p>
          <button
            type="button"
            onClick={() => void checkYouTubeAuth()}
            className="shrink-0 text-xs text-accent hover:underline"
          >
            Re-check
          </button>
        </div>
      );
    default:
      return null;
  }
}

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
    ytAuth,
    beginYouTubeSignIn,
  } = useClipperContext();
  const qualityOptions =
    format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  const selectClass = "field appearance-none pr-8 cursor-pointer";
  const signingIn = ytAuth.status === "checking";

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

      <div className="flex flex-col gap-2 rounded-row border border-hairline bg-panel-raised p-3">
        <span className="text-[11px] uppercase tracking-wider text-fg-faint">
          YouTube sign-in (optional)
        </span>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-fg-faint">Browser</span>
          <select
            value={cookieBrowser}
            onChange={(e) => setCookieBrowser(e.target.value as CookieBrowser)}
            className={selectClass}
          >
            {COOKIE_BROWSERS.map((b) => (
              <option key={b} value={b}>
                {BROWSER_LABELS[b]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void beginYouTubeSignIn()}
          disabled={signingIn}
          className="btn"
        >
          {signingIn ? (
            <ArrowRepeat className="animate-spin" size={14} />
          ) : (
            <BoxArrowUpRight size={14} />
          )}
          {signingIn ? "Waiting for sign-in…" : "Sign in to YouTube"}
        </button>

        <SignInStatus />

        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={useBrowserCookies}
            onChange={(e) => setUseBrowserCookies(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          <span className="flex items-center gap-1.5">
            <PersonCircle size={13} />
            Use my browser session for higher quality
          </span>
        </label>

        <p className="text-[11px] leading-snug text-fg-faint">
          Uses your logged-in YouTube session to try for 1080p+ where
          available. Not all videos support higher quality. Your cookies are
          read directly by the downloader and never stored or sent anywhere.
        </p>
      </div>
    </div>
  );
}
