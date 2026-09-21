/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: One-time YouTube sign-in. Primary path signs in inside the app;
 * reading a desktop browser's cookies is a collapsed fallback.
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
  ShieldLock,
} from "react-bootstrap-icons";
import { COOKIE_BROWSERS, type CookieBrowser } from "../lib/clip";
import ConnectProgress from "./ConnectProgress";
import DiagnosticsDisclosure from "./DiagnosticsDisclosure";
import {
  checkBrowserConnection,
  connectInApp,
  importCookies,
  openYouTubeSignIn,
  selectBrowser,
  useYouTubeConnection,
} from "../lib/youtubeConnection";

export default function YouTubeConnectModal({ open }: { open: boolean }) {
  const state = useYouTubeConnection();
  const [showFallback, setShowFallback] = useState(false);

  if (!open) return null;

  // Silent launch-time restore: show a quiet placeholder rather than the
  // sign-in prompt, so a still-valid session never flashes a false "connect".
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
            Restoring your YouTube sign-in…
          </div>
          {/* Same check as sign-in verification, so it can take a while too. */}
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
      <div className="w-full max-w-md rounded-row border border-hairline bg-panel p-5 shadow-xl">
        <h2 id="youtube-connect-title" className="text-[15px] font-medium">
          Connect YouTube
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
          Sign in once, inside the app. The session is stored on this computer
          only, stays signed in across restarts, and is never uploaded.
        </p>

        {state.canSignInApp ? (
          <>
            <button
              type="button"
              className="btn-primary mt-5 flex w-full items-center justify-center gap-2"
              disabled={state.busy}
              onClick={() => void connectInApp()}
            >
              {state.busy ? (
                <ArrowRepeat className="animate-spin" size={12} />
              ) : (
                <ShieldLock size={12} />
              )}
              {!state.busy
                ? "Sign in to YouTube"
                : state.phase === "verifying"
                  ? "Verifying…"
                  : "Waiting for sign-in…"}
            </button>
            {!state.busy ? (
              <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
                A YouTube login window opens inside the app. Once you're in, it
                closes itself and you won't be asked again.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-5 text-[12px] text-fg-muted">
            In-app sign-in needs the desktop app. Use the browser option below.
          </p>
        )}

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

        <ConnectProgress />

        <div className="mt-5 border-t border-hairline pt-3">
          <p className="text-[11px] leading-relaxed text-fg-faint">
            Google blocks sign-in from inside an app on some systems, and
            Windows browsers lock and encrypt their cookies so they can't be
            read. If the button above doesn't work, this always does:
          </p>
          <button
            type="button"
            className="btn mt-2 flex w-full items-center justify-center gap-2"
            disabled={state.busy}
            onClick={() => void importCookies()}
          >
            <FileEarmarkArrowUp size={12} />
            Import cookies.txt
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
            In the browser you're signed into YouTube with, install a
            "Get cookies.txt" extension, export while on youtube.com, then
            pick that file here. The browser does its own decryption, so this
            works while it is running and whatever encryption it uses.
          </p>

          <button
            type="button"
            className="mt-4 flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-muted"
            aria-expanded={showFallback}
            onClick={() => setShowFallback((v) => !v)}
          >
            {showFallback ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Use my browser session instead
          </button>

          {showFallback ? (
            <div className="mt-3">
              <p className="text-[11px] leading-relaxed text-fg-faint">
                Reads the YouTube cookies from a browser you're already signed
                into. Newer Chrome versions encrypt those cookies, so this can
                fail even when you are signed in — quit the browser fully first.
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
