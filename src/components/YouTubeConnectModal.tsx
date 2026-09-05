/**
 * File: YouTubeConnectModal.tsx
 * Path: src/components/YouTubeConnectModal.tsx
 * Description: Required two-step prompt for connecting through the default browser.
 */
import {
  ArrowRepeat,
  BoxArrowUpRight,
  ExclamationTriangleFill,
} from "react-bootstrap-icons";
import {
  checkConnection,
  openYouTubeSignIn,
  useYouTubeConnection,
} from "../lib/youtubeConnection";

export default function YouTubeConnectModal({
  open,
}: {
  open: boolean;
}) {
  const state = useYouTubeConnection();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="youtube-connect-title"
    >
      <div className="w-full max-w-md rounded-row border border-hairline bg-panel p-5 shadow-xl">
        <div>
            <h2 id="youtube-connect-title" className="text-[15px] font-medium">Connect YouTube</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
              A verified YouTube session is required for reliable, high-quality downloads.
              Your sign-in stays in your browser and is never uploaded.
            </p>
        </div>

        <ol className="mt-5 space-y-4">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-hover text-[11px] text-fg-muted">1</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Sign in in your browser</p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                Open YouTube, sign in, and leave that browser tab open.
              </p>
              <button
                type="button"
                className="btn mt-3 flex items-center gap-2"
                onClick={() => void openYouTubeSignIn()}
              >
                <BoxArrowUpRight size={12} />
                Connect YouTube
              </button>
            </div>
          </li>
          <li className="flex gap-3 border-t border-hairline pt-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-hover text-[11px] text-fg-muted">2</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Return here and verify</p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                Once YouTube shows your account, come back and check the connection.
              </p>
              <button
                type="button"
                className="btn-primary mt-3 flex items-center gap-2"
                disabled={state.busy}
                onClick={() => void checkConnection()}
              >
                {state.busy ? <ArrowRepeat className="animate-spin" size={12} /> : null}
                {state.busy ? "Checking…" : "Check Connection"}
              </button>
            </div>
          </li>
        </ol>

        {state.message ? (
          <div className="mt-4 flex items-start gap-2 rounded-chip bg-bg-deep/40 px-3 py-2 text-[12px] text-amber-400">
            <ExclamationTriangleFill className="mt-0.5 shrink-0" size={12} />
            <span>{state.message}</span>
          </div>
        ) : null}

        {state.busy && state.step ? (
          <p className="mt-3 text-[11px] text-fg-faint">{state.step}</p>
        ) : null}
      </div>
    </div>
  );
}
