/**
 * File: FormatQualityFields.tsx
 * Path: src/components/FormatQualityFields.tsx
 * Description: Format (mp4/mp3) and Quality selects; quality options swap by format.
 * Includes a compact, optional YouTube sign-in row with automatic browser detection.
 */
import type { ReactNode } from "react";
import {
  ArrowRepeat,
  BoxArrowUpRight,
  CheckCircleFill,
  ExclamationTriangleFill,
  PersonCircle,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import type { CookieBrowser } from "../lib/clip";
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

/**
 * Compact one-row sign-in control — status text on the left, a single
 * contextual action on the right. The backend auto-detects which browser
 * holds the session, so there is no browser picker.
 */
function YouTubeSignInRow() {
  const {
    ytAuth,
    cookieBrowser,
    setCookieBrowser,
    useBrowserCookies,
    setUseBrowserCookies,
    beginYouTubeSignIn,
    checkYouTubeAuth,
  } = useClipperContext();

  let icon: ReactNode;
  let text: string;
  let textClass = "text-fg-muted";
  switch (ytAuth.status) {
    case "checking":
      icon = <ArrowRepeat className="animate-spin" size={12} />;
      text = `Checking ${BROWSER_LABELS[cookieBrowser]}…`;
      break;
    case "ready":
      icon = <PersonCircle size={12} />;
      text = `Signed in there? Check the ${BROWSER_LABELS[cookieBrowser]} session.`;
      break;
    case "signed_in":
      icon = <CheckCircleFill size={12} />;
      textClass = "text-accent";
      text = `Signed in via ${
        ytAuth.browser ? BROWSER_LABELS[ytAuth.browser] : "your browser"
      } — higher quality will be tried on your next download.`;
      break;
    case "profile_missing":
    case "locked":
    case "decrypt_failed":
    case "timeout":
    case "extractor_error":
      icon = <ExclamationTriangleFill size={12} />;
      textClass = "text-amber-400";
      text = ytAuth.message ?? "Couldn't read the browser's cookies.";
      break;
    case "signed_out":
      icon = <ExclamationTriangleFill size={12} />;
      text = ytAuth.message ?? "No sign-in detected yet.";
      break;
    default:
      icon = <PersonCircle size={12} />;
      text = "Optional: sign in to YouTube to try for 1080p+ where available.";
  }

  let action: ReactNode;
  if (ytAuth.status === "checking") {
    action = (
      <button
        type="button"
        disabled
        className="btn shrink-0 px-3 py-1.5 text-xs"
      >
        <ArrowRepeat className="animate-spin" size={12} />
        Checking…
      </button>
    );
  } else if (ytAuth.status === "signed_in") {
    action = (
      <button
        type="button"
        onClick={() => setUseBrowserCookies(!useBrowserCookies)}
        className="shrink-0 text-xs text-accent hover:underline"
      >
        {useBrowserCookies ? "Disable" : "Enable"}
      </button>
    );
  } else if (ytAuth.status === "ready") {
    action = (
      <button
        type="button"
        onClick={() => void checkYouTubeAuth()}
        className="btn-primary shrink-0 px-3 py-1.5 text-xs"
      >
        Check session
      </button>
    );
  } else {
    action = (
      <>
        {ytAuth.status !== "idle" && (
          <button
            type="button"
            onClick={() => void checkYouTubeAuth()}
            className="shrink-0 text-xs text-accent hover:underline"
          >
            Check
          </button>
        )}
        <button
          type="button"
          onClick={() => void beginYouTubeSignIn()}
          className="btn shrink-0 px-3 py-1.5 text-xs"
        >
          <BoxArrowUpRight size={12} />
          Open YouTube
        </button>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-2">
      <label className="sr-only" htmlFor="cookie-browser">Browser session</label>
      <select
        id="cookie-browser"
        value={cookieBrowser}
        onChange={(event) => setCookieBrowser(event.target.value as CookieBrowser)}
        disabled={ytAuth.status === "checking"}
        className="max-w-[92px] shrink-0 bg-transparent text-xs text-fg outline-none"
        title="Browser session to check"
      >
        {Object.entries(BROWSER_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <span className={`shrink-0 ${textClass}`}>{icon}</span>
      <p
        className={`min-w-0 flex-1 truncate text-xs ${textClass}`}
        title={text}
      >
        {text}
      </p>
      {action}
    </div>
  );
}

export default function FormatQualityFields() {
  const { info, format, setFormat, quality, setQuality } = useClipperContext();
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

      <YouTubeSignInRow />
    </div>
  );
}
