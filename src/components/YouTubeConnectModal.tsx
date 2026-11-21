/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: YouTube connect, in order of least effort for the user:
 *   1. On open, the app sweeps the installed browsers itself
 *      (--cookies-from-browser). If one works the user does nothing at all.
 *   2. Otherwise a guided three-step cookies.txt import: install the
 *      extension, export youtube.com cookies, drop the file on the window
 *      (or use the picker). The extension is named for the user's browser.
 *   3. After that the sign-in is remembered and refreshes itself. The app
 *      never promises it lasts forever: YouTube can end a session.
 *
 * The incognito procedure is yt-dlp's own, reproduced step for step from
 * https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies —
 * it is not a nicety. YouTube rotates account cookies on open YouTube tabs,
 * so a file exported from the browser the user keeps browsing in is
 * invalidated within hours, which is why this app kept asking them to import
 * a new one. A private session that is closed and never reopened is never
 * rotated, so the file keeps working.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRepeat,
  BoxArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExclamationTriangleFill,
  FileEarmarkArrowUp,
  Search,
} from "react-bootstrap-icons";
import { COOKIE_BROWSERS, type CookieBrowser } from "../lib/clip";
import DiagnosticsDisclosure from "./DiagnosticsDisclosure";
import BrandMark from "./shell/BrandMark";
import {
  checkBrowserConnection,
  importCookies,
  importDroppedCookies,
  openYouTubeSignIn,
  selectBrowser,
  sweepBrowsers,
  useYouTubeConnection,
} from "../lib/youtubeConnection";

/** An indeterminate bar: no step here reports a percentage, so never fake one. */
function Working({ label }: { label: string }) {
  return (
    <div
      className="mt-4 rounded-chip border border-hairline bg-bg-deep/40 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
        />
        <span className="min-w-0 flex-1 text-[12px] text-fg-dim">{label}</span>
      </div>
      <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
        <motion.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

/**
 * The exporter to install for a browser. Named exactly so the user is never
 * told to find "a cookies.txt extension". These are the two yt-dlp's own FAQ
 * names. Edge and Safari have no extension we have verified, so `extension` is
 * null there and the flow points at the automatic browser sweep instead; do not
 * invent a recommendation for them.
 */
export function extensionFor(browser: CookieBrowser | string): {
  browserLabel: string;
  extension: string | null;
  where: string;
  /** Extra line for this browser (the Safari permission, say). */
  note?: string;
} {
  const label = browser ? browser[0].toUpperCase() + browser.slice(1) : "your browser";
  switch (browser) {
    case "firefox":
      return { browserLabel: label, extension: "cookies.txt (by Lennon Hill)", where: "Firefox Add-ons" };
    case "safari":
      return {
        browserLabel: label,
        extension: null,
        where: "",
        note: "Safari needs Full Disk Access for this app (System Settings, Privacy & Security) before its cookies can be read.",
      };
    case "edge":
      return { browserLabel: label, extension: null, where: "" };
    default:
      return { browserLabel: label, extension: "Get cookies.txt LOCALLY", where: "the Chrome Web Store" };
  }
}

/**
 * The older "Get cookies.txt" (without LOCALLY) was reported as malware and
 * removed from the Chrome Web Store; yt-dlp advises uninstalling it. Store
 * search shows similarly named clones, so the exact name matters.
 */
export const COOKIE_EXTENSION_WARNING =
  'Install exactly this name. The older "Get cookies.txt" without LOCALLY was reported as malware and removed from the Chrome Web Store; yt-dlp advises uninstalling it. Search results also show look-alike clones.';

// One automatic sweep per app session: a failed sweep must not re-run, and
// prompt for keychain access again, every time the modal re-renders.
let autoSwept = false;

export default function YouTubeConnectModal({ open }: { open: boolean }) {
  const state = useYouTubeConnection();
  const [showBrowserRoute, setShowBrowserRoute] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ext = extensionFor(state.browser);
  const expired = state.expired;

  // Step 1 of the flow: look in the browsers before asking the user for anything.
  useEffect(() => {
    if (!open || autoSwept || state.restoring || !state.probed || state.connected) return;
    autoSwept = true;
    void sweepBrowsers();
  }, [open, state.restoring, state.probed, state.connected]);

  // Drop a cookies.txt anywhere on the window.
  useEffect(() => {
    if (!open) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      // relatedTarget is null when the pointer leaves the window itself.
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void importDroppedCookies(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [open]);

  if (!open) return null;

  // Silent launch-time restore: show a quiet placeholder rather than the
  // connect prompt, so a still-valid cookies.txt never flashes a false ask.
  if (state.restoring) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/90 p-6"
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-[280px]">
          <div className="flex items-center gap-2 text-[12px] text-fg-dim">
            <ArrowRepeat className="animate-spin" size={12} />
            Checking your sign-in…
          </div>
          <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
            <motion.div
              className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    );
  }

  const step = (n: number, title: string, detail: React.ReactNode) => (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent text-[12px] text-accent"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-fg">{title}</span>
        <span className="mt-1 block text-[12px] leading-snug text-fg-dim">{detail}</span>
      </span>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="youtube-connect-title"
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-panel border-2 border-dashed border-accent bg-accent-card text-[16px] text-accent">
          Drop cookies.txt to sign in
        </div>
      ) : null}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-panel border border-hairline bg-panel p-5 shadow-panel">
        {/* First thing a new install shows, so it carries the mark. */}
        <BrandMark size={22} className="mb-3" />
        <h2 id="youtube-connect-title" className="text-[20px] font-medium leading-tight">
          {expired ? "YouTube sign-in expired" : "Sign in to YouTube"}
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-fg-dim">
          {expired
            ? "Without a valid sign-in YouTube gives 360p. Import a fresh cookies.txt to get 1080p back."
            : "Without a sign-in YouTube gives 360p. The sign-in stays on this computer and is never uploaded."}
        </p>

        {state.busy && state.step ? <Working label={state.step} /> : null}

        <p className="mt-5 text-[13px] text-fg">
          Not found automatically. Three steps:
        </p>
        <ol className="mt-3 space-y-3">
          {ext.extension
            ? step(
                1,
                `Install ${ext.extension} in ${ext.browserLabel}`,
                <>
                  From {ext.where}. It exports cookies on this computer and sends them nowhere.{" "}
                  {COOKIE_EXTENSION_WARNING}
                </>,
              )
            : step(
                1,
                `${ext.browserLabel}: let the app read the browser directly`,
                <>
                  We have not verified a cookies.txt extension for {ext.browserLabel}, so none is
                  recommended. Use Check browsers again below, which reads {ext.browserLabel} itself.
                  {ext.note ? ` ${ext.note}` : ""} Or export from Chrome or Firefox instead.
                </>,
              )}
          {step(
            2,
            "Export the youtube.com cookies",
            <>
              Open a private window, sign in to YouTube, then in the same tab go to
              youtube.com/robots.txt and export from there. Close the private
              window afterwards. A session you keep browsing in rotates and
              stops working within hours.
            </>,
          )}
          {step(
            3,
            "Drop the file here",
            <>Or choose it below. The file and sign-in are checked at once.</>,
          )}
        </ol>

        <button
          type="button"
          className="btn-primary mt-5 flex h-btn w-full items-center justify-center gap-2"
          disabled={state.busy || !state.canImport}
          onClick={() => void importCookies()}
        >
          {state.busy ? (
            <ArrowRepeat className="animate-spin" size={16} />
          ) : (
            <FileEarmarkArrowUp size={16} />
          )}
          {state.busy ? "Checking…" : "Choose cookies.txt"}
        </button>
        {!state.canImport ? (
          <p className="mt-2 text-[12px] leading-snug text-fg-dim">
            Importing a file needs the desktop app. In the browser preview, use
            the browser option below.
          </p>
        ) : null}

        {state.message ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-control border border-accent bg-accent-card px-3 py-2 text-[13px] leading-snug text-accent"
          >
            <ExclamationTriangleFill className="mt-0.5 shrink-0" size={16} />
            <span>{state.message}</span>
          </div>
        ) : null}

        {state.notice ? (
          <p role="status" className="mt-3 text-[12px] leading-snug text-fg-dim">
            {state.notice}
          </p>
        ) : null}

        {state.reason ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[12px] text-fg-dim">
              Technical details
            </summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-chip bg-bg-deep/60 p-2 text-[12px] leading-snug text-fg-dim">
              {state.reason}
            </pre>
          </details>
        ) : null}

        <p className="mt-4 text-[12px] leading-snug text-fg-dim">
          Once imported, the sign-in is kept and refreshed each time you use the
          app. YouTube can end a session at any time, for example after a
          password change or signing out everywhere. The app tells you when
          that happens.
        </p>

        <div className="mt-5 border-t border-hairline pt-3">
          <p className="text-[12px] leading-snug text-fg-dim">
            Or read a browser's own cookies. Firefox works on macOS and Windows.
            Chrome and Chromium on Windows cannot be read, because Chrome 127
            encrypts its cookies. Cookies read this way rotate, so expect to
            redo it.
          </p>
          <button
            type="button"
            className="btn mt-2 flex h-btn w-full items-center justify-center gap-2"
            disabled={state.busy}
            onClick={() => void sweepBrowsers()}
          >
            <Search size={16} />
            Check browsers again
          </button>

          <button
            type="button"
            className="mt-3 flex items-center gap-1 text-[12px] text-fg-dim hover:text-fg"
            aria-expanded={showBrowserRoute}
            onClick={() => setShowBrowserRoute((v) => !v)}
          >
            {showBrowserRoute ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            Pick a browser
          </button>

          {showBrowserRoute ? (
            <div className="mt-3">
              <p className="text-[12px] leading-snug text-fg-dim">
                Sign in to YouTube in that browser and leave the tab open. Then
                quit the browser fully. A running browser locks its cookies.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn flex items-center gap-2"
                  onClick={() => void openYouTubeSignIn()}
                >
                  <BoxArrowUpRight size={16} />
                  Open YouTube
                </button>
                <select
                  className="input h-8 rounded-chip border border-hairline bg-panel-raised px-2 text-[13px] capitalize"
                  aria-label="Browser to check"
                  value={state.browser}
                  disabled={state.busy}
                  onChange={(event) =>
                    selectBrowser(event.target.value as CookieBrowser)
                  }
                >
                  {COOKIE_BROWSERS.map((browser) => (
                    <option key={browser} value={browser} className="capitalize">
                      {browser}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn flex items-center gap-2"
                  disabled={state.busy}
                  onClick={() => void checkBrowserConnection()}
                >
                  {state.busy ? (
                    <ArrowRepeat className="animate-spin" size={16} />
                  ) : null}
                  {state.busy ? "Checking…" : "Check browser"}
                </button>
              </div>
            </div>
          ) : null}

          <DiagnosticsDisclosure />
        </div>
      </div>
    </div>
  );
}
