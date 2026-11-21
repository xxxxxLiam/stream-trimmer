/**
 * File: YouTubeStatusChip.tsx
 * Path: src/components/YouTubeStatusChip.tsx
 * Description: Persistent header chip for the YouTube sign-in. Exactly four
 * states, each distinct by label AND by dot shape so none relies on colour:
 *   Signed in                 filled light dot
 *   Signed in, expires soon   filled accent dot with glow, accent text
 *   Sign-in expired           hollow accent ring, accent text on a warning card
 *   Not signed in             hollow grey ring
 * The tooltip always says the day the sign-in stops working when that is
 * known, so staleness is never a surprise. A rate limit is shown as a note
 * and never as an expiry: re-importing cookies does not help a rate limit.
 */
import { useEffect, useRef, useState } from "react";
import {
  SESSION_LABEL,
  checkConnection,
  deriveSessionStatus,
  formatExpiryDay,
  importCookies,
  refreshSessionStatus,
  signOut,
  useYouTubeConnection,
  type SessionStatus,
} from "../lib/youtubeConnection";

const HOUR = 60 * 60 * 1000;

function dotClass(status: SessionStatus): string {
  switch (status) {
    case "signed_in":
      return "bg-fg";
    case "expiring_soon":
      return "bg-accent shadow-[0_0_8px_hsl(var(--accent-h)_var(--accent-s)_var(--accent-l)/0.7)]";
    case "expired":
      return "border-[1.5px] border-accent bg-transparent";
    case "not_signed_in":
      return "border-[1.5px] border-fg-dim bg-transparent";
    default:
      return "animate-pulse bg-fg-dim";
  }
}

function describe(
  status: SessionStatus,
  expiresAt: number | null,
  source: string,
  notice: string | undefined,
): string {
  const where =
    source === "app" ? "your imported cookies.txt" : `your ${source} browser session`;
  const parts: string[] = [];
  switch (status) {
    case "signed_in":
      parts.push(`Using ${where}. It is remembered across restarts and refreshes itself while you use the app.`);
      parts.push(
        expiresAt
          ? `It is due to run out on ${formatExpiryDay(expiresAt)}. The app will tell you before then.`
          : "It has no fixed end date, but YouTube can end a session at any time. The app will tell you the day it stops working.",
      );
      break;
    case "expiring_soon":
      parts.push(
        expiresAt
          ? `This sign-in runs out on ${formatExpiryDay(expiresAt)}. Import a fresh cookies.txt before then to keep 1080p.`
          : "This sign-in is about to run out. Import a fresh cookies.txt to keep 1080p.",
      );
      break;
    case "expired":
      parts.push(
        expiresAt
          ? `This sign-in ran out on ${formatExpiryDay(expiresAt)}. Without it YouTube serves 360p. Import a fresh cookies.txt.`
          : "YouTube no longer accepts this sign-in, so it serves 360p. Import a fresh cookies.txt.",
      );
      break;
    case "not_signed_in":
      parts.push("Sign in to unlock 1080p and higher.");
      break;
    default:
      parts.push("Checking your YouTube sign-in");
  }
  if (notice) parts.push(notice);
  return parts.join(" ");
}

export default function YouTubeStatusChip() {
  const conn = useYouTubeConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Re-read the saved file's date on mount, on window focus and hourly, so a
  // sign-in that is running out is announced without any network request.
  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      void refreshSessionStatus();
    };
    refresh();
    const timer = window.setInterval(refresh, HOUR);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Close the menu on any click outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const status = deriveSessionStatus(conn, now);
  const label = status === "checking" ? "Checking…" : SESSION_LABEL[status];
  const needsAttention = status === "expiring_soon" || status === "expired";
  const textClass = needsAttention ? "text-accent" : "text-fg-dim";
  const surface =
    status === "expired"
      ? "border-accent bg-accent-card"
      : "border-hairline hover:border-hairlineStrong hover:bg-hover";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        title={describe(status, conn.expiresAt, conn.source, conn.notice)}
        className={`flex h-chip items-center gap-2 rounded-chip border px-2 text-[12px] transition-colors ${surface} ${textClass}`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${dotClass(status)}`}
        />
        {label}
      </button>

      {/* Not part of the four states: a rate limit is neither expiry nor a
          lost sign-in, and says so in words the user can act on (by waiting). */}
      {conn.notice ? (
        <p
          role="status"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-chip border border-hairlineStrong bg-panel-raised p-2 text-[12px] leading-snug text-fg-dim"
        >
          {conn.notice}
        </p>
      ) : null}

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-control border border-hairline bg-panel-raised py-1 shadow-panel"
        >
          <p className="px-3 py-2 text-[12px] leading-snug text-fg-dim">
            {describe(status, conn.expiresAt, conn.source, undefined)}
          </p>
          <button
            type="button"
            role="menuitem"
            className="block h-row w-full px-3 text-left text-[13px] text-fg hover:bg-hover"
            onClick={() => {
              setMenuOpen(false);
              void importCookies();
            }}
          >
            {conn.connected && status !== "expired"
              ? "Import a fresh cookies.txt"
              : "Import cookies.txt"}
          </button>
          {conn.connected ? (
            <button
              type="button"
              role="menuitem"
              className="block h-row w-full px-3 text-left text-[13px] text-fg hover:bg-hover"
              onClick={() => {
                setMenuOpen(false);
                void checkConnection();
              }}
            >
              Check with YouTube now
            </button>
          ) : null}
          {/* The diagnostics log otherwise lives only inside the Connect
              screen, which is hidden exactly when you are connected — i.e.
              whenever a download fails and the log is what you need. */}
          {window.electronAPI?.copyDiagnostics ? (
            <button
              type="button"
              role="menuitem"
              className="block h-row w-full px-3 text-left text-[13px] text-fg hover:bg-hover"
              onClick={async () => {
                setMenuOpen(false);
                const result = await window.electronAPI?.copyDiagnostics?.();
                setCopied(result?.ok ? "Log copied" : "Copy failed");
                window.setTimeout(() => setCopied(""), 2500);
              }}
            >
              Copy diagnostics log
            </button>
          ) : null}
          {status !== "not_signed_in" ? (
            <button
              type="button"
              role="menuitem"
              className="block h-row w-full px-3 text-left text-[13px] text-accent hover:bg-hover"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
            >
              Forget this sign-in
            </button>
          ) : null}
        </div>
      ) : null}

      {copied ? (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-chip bg-panel-raised px-2 py-1 text-[12px] text-fg-dim shadow-panel">
          {copied}
        </span>
      ) : null}
    </div>
  );
}
