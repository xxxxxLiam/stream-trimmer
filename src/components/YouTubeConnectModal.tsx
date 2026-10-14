/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: One-time YouTube connect. Primary path imports a cookies.txt
 * exported from a private/incognito window; reading a browser's own cookie
 * store is a secondary option.
 *
 * The incognito procedure is yt-dlp's own, reproduced step for step from
 * https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies —
 * it is not a nicety. YouTube rotates account cookies on open YouTube tabs,
 * so a file exported from the browser the user keeps browsing in is
 * invalidated within hours, which is why this app kept asking them to import
 * a new one. A private session that is closed and never reopened is never
 * rotated, so the file keeps working.
 */
import { useState } from "react";
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
import {
  checkBrowserConnection,
  importCookies,
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
        <span className="min-w-0 flex-1 text-[12px] text-fg-muted">{label}</span>
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

const STEPS = [
  "Open a new private browsing/incognito window and log into YouTube.",
  "In the same window and same tab, go to https://www.youtube.com/robots.txt — this should be the only private/incognito tab open.",
  "Export youtube.com cookies with a “Get cookies.txt LOCALLY” style extension.",
  "Close the private window, so that session is never opened in the browser again. Then import the file below.",
];

export default function YouTubeConnectModal({ open }: { open: boolean }) {
  const state = useYouTubeConnection();
  const [showBrowserRoute, setShowBrowserRoute] = useState(false);

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
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <ArrowRepeat className="animate-spin" size={12} />
            Checking your YouTube cookies…
          </div>
          {/* Same yt-dlp check as a fresh import, so it can take a while too. */}
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="youtube-connect-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-row border border-hairline bg-panel p-5 shadow-xl">
        <h2 id="youtube-connect-title" className="text-[15px] font-medium">
          Connect YouTube
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
          Import a cookies.txt exported from your browser. It stays on this
          computer, is read only by the downloader, and is never uploaded.
        </p>

        <p className="mt-4 text-[12px] font-medium text-fg">
          Export it from a private window
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-faint">
          YouTube rotates account cookies on open YouTube tabs, so a file
          exported from your normal browsing stops working within hours. A
          private session you close and never reopen is never rotated — that's
          the one that keeps working.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[11px] leading-relaxed text-fg-muted marker:text-fg-faint">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <button
          type="button"
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2"
          disabled={state.busy || !state.canImport}
          onClick={() => void importCookies()}
        >
          {state.busy ? (
            <ArrowRepeat className="animate-spin" size={12} />
          ) : (
            <FileEarmarkArrowUp size={12} />
          )}
          {state.busy ? "Checking…" : "Import cookies.txt"}
        </button>
        {!state.canImport ? (
          <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
            Importing a file needs the desktop app. In the browser preview, use
            the browser option below.
          </p>
        ) : null}

        {state.busy && state.step ? <Working label={state.step} /> : null}

        {state.message ? (
          <div className="mt-4 flex items-start gap-2 rounded-chip bg-bg-deep/40 px-3 py-2 text-[12px] text-amber-400">
            <ExclamationTriangleFill className="mt-0.5 shrink-0" size={12} />
            <span>{state.message}</span>
          </div>
        ) : null}

        {state.reason ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-fg-faint">
              Technical details
            </summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-chip bg-bg-deep/60 p-2 text-[10px] leading-relaxed text-fg-faint">
              {state.reason}
            </pre>
          </details>
        ) : null}

        <div className="mt-5 border-t border-hairline pt-3">
          <p className="text-[11px] leading-relaxed text-fg-faint">
            Or let the downloader read a browser's own cookies. Firefox works
            reliably on macOS and Windows; Chrome and Chromium on Windows
            cannot be read at all, because Chrome 127 encrypts its cookie
            database against other programs. Cookies read this way are the
            rotating kind, so expect to redo it.
          </p>
          <button
            type="button"
            className="btn mt-2 flex w-full items-center justify-center gap-2"
            disabled={state.busy}
            onClick={() => void sweepBrowsers()}
          >
            <Search size={12} />
            Find my YouTube session
          </button>

          <button
            type="button"
            className="mt-3 flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-muted"
            aria-expanded={showBrowserRoute}
            onClick={() => setShowBrowserRoute((v) => !v)}
          >
            {showBrowserRoute ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
            Check one browser myself
          </button>

          {showBrowserRoute ? (
            <div className="mt-3">
              <p className="text-[11px] leading-relaxed text-fg-faint">
                Sign in to YouTube in that browser first and leave the tab
                open. Quit the browser fully before checking — a running
                browser holds its cookie database locked.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn flex items-center gap-2"
                  onClick={() => void openYouTubeSignIn()}
                >
                  <BoxArrowUpRight size={12} />
                  Open YouTube
                </button>
                <select
                  className="input h-8 rounded-chip border border-hairline bg-panel-raised px-2 text-[12px] capitalize"
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
                    <ArrowRepeat className="animate-spin" size={12} />
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
