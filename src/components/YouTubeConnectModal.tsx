/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: Connection prompt — a single Connect YouTube button that tries
 * the in-app sign-in window and then sweeps the installed browsers' sessions.
 * Cookie contents never enter the renderer; only a status and a file path do.
 */
import {
  ArrowRepeat,
  CheckCircleFill,
  ExclamationTriangleFill,
  X,
} from "react-bootstrap-icons";
import type { CookieBrowser } from "../lib/clip";
import { connect, disconnect, useYouTubeConnection } from "../lib/youtubeConnection";

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

  if (!open) return null;

  const handleConnect = async () => {
    const ok = await connect();
    if (ok) onClose();
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

        <div className="mt-5 flex items-center gap-3">
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
              {state.busy && state.step ? (
                <span className="text-[11px] text-fg-faint">{state.step}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
