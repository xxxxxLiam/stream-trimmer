/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: Connection prompt — one-click in-app YouTube sign-in, with the
 * browser-cookie flow kept as a secondary fallback. Cookie contents never
 * enter the renderer; only a status and a file path do.
 */
import { useState } from "react";
import {
  ArrowRepeat,
  BoxArrowUpRight,
  CheckCircleFill,
  ExclamationTriangleFill,
  X,
} from "react-bootstrap-icons";
import type { CookieBrowser } from "../lib/clip";
import {
  checkBrowserSession,
  connectInApp,
  disconnect,
  openExternalSignIn,
  setBrowser,
  suppressPrompt,
  useYouTubeConnection,
} from "../lib/youtubeConnection";

const BROWSER_LABELS: Record<CookieBrowser, string> = {
  chrome: "Chrome",
  safari: "Safari",
  edge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  chromium: "Chromium",
};

export default function YouTubeConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const state = useYouTubeConnection();
  const [showFallback, setShowFallback] = useState(false);
  const isElectron =
    typeof window !== "undefined" && !!window.electronAPI?.isElectron;

  if (!open) return null;

  const handleConnect = async () => {
    const ok = await connectInApp();
    if (ok) onClose();
  };

  const handleNeverAsk = () => {
    suppressPrompt();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/70 p-6">
      <div className="w-full max-w-md rounded-row border border-hairline bg-panel p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium">Connect YouTube</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
              Signing in unlocks 1080p and higher downloads. It stays local —
              nothing is uploaded and your password never touches this app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-chip p-1 text-fg-faint hover:bg-panel-hover"
          >
            <X size={16} />
          </button>
        </div>

        {state.connected ? (
          <div className="mt-4 flex items-center gap-2 rounded-chip bg-bg-deep/40 px-3 py-2 text-[12px] text-fg-muted">
            <CheckCircleFill className="text-emerald-400" size={12} />
            Connected
            {state.mode === "browser"
              ? ` via ${BROWSER_LABELS[state.browser]}`
              : ""}
          </div>
        ) : null}

        {state.message ? (
          <div className="mt-4 flex items-start gap-2 rounded-chip bg-bg-deep/40 px-3 py-2 text-[12px] text-amber-400">
            <ExclamationTriangleFill className="mt-0.5 shrink-0" size={12} />
            <span>{state.message}</span>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {state.connected ? (
            <button
              type="button"
              className="btn"
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
          ) : (
            <>
              {isElectron ? (
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  disabled={state.busy}
                  onClick={() => void handleConnect()}
                >
                  {state.busy ? (
                    <ArrowRepeat className="animate-spin" size={12} />
                  ) : null}
                  Connect YouTube
                </button>
              ) : null}
              <button type="button" className="btn" onClick={onClose}>
                Not now
              </button>
              <button
                type="button"
                className="text-[11px] text-fg-faint hover:text-fg-muted"
                onClick={handleNeverAsk}
              >
                Don&apos;t ask again
              </button>
            </>
          )}
        </div>

        <div className="mt-5 border-t border-hairline pt-3">
          <button
            type="button"
            className="text-[11px] text-fg-faint hover:text-fg-muted"
            onClick={() => setShowFallback((v) => !v)}
          >
            {showFallback ? "Hide" : "Use my browser's session instead"}
          </button>

          {showFallback ? (
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px] text-fg-muted">
                Browser
                <select
                  className="field appearance-none cursor-pointer"
                  value={state.browser}
                  onChange={(e) =>
                    setBrowser(e.target.value as CookieBrowser)
                  }
                >
                  {(
                    Object.keys(BROWSER_LABELS) as CookieBrowser[]
                  ).map((b) => (
                    <option key={b} value={b}>
                      {BROWSER_LABELS[b]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn flex items-center gap-1.5"
                  onClick={() => void openExternalSignIn()}
                >
                  <BoxArrowUpRight size={11} />
                  Open YouTube
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={state.busy}
                  onClick={() => void checkBrowserSession()}
                >
                  Check session
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-fg-faint">
                Fully quit the browser first if its cookie store is locked.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
