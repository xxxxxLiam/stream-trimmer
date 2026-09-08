/**
 * File: YouTubeStatusChip.tsx
 * Path: src/components/YouTubeStatusChip.tsx
 * Description: Compact top-bar chip showing the shared YouTube connection
 * state, with a menu to re-check or sign out of the stored session.
 */
import { useEffect, useRef, useState } from "react";
import {
  checkConnection,
  signOut,
  useYouTubeConnection,
} from "../lib/youtubeConnection";

export default function YouTubeStatusChip() {
  const { connected, busy, restoring, source } = useYouTubeConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on any click outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const working = busy || restoring;
  const label = restoring
    ? "Restoring…"
    : busy
      ? "Connecting…"
      : connected
        ? "YouTube connected"
        : "Not connected";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (connected) setMenuOpen((v) => !v);
          else void checkConnection();
        }}
        title={
          connected
            ? source === "app"
              ? "Signed in inside the app — stays signed in across restarts"
              : `Using your ${source} browser session`
            : "Connect YouTube to unlock 1080p+ downloads"
        }
        className={`flex items-center gap-1.5 rounded-chip border border-hairline px-2 py-1 text-[11px] transition-colors hover:bg-panel-hover ${
          connected ? "text-fg-muted" : "text-amber-400"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            working
              ? "animate-pulse bg-fg-faint"
              : connected
                ? "bg-emerald-400"
                : "bg-amber-400"
          }`}
        />
        {label}
      </button>

      {menuOpen && connected ? (
        <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-row border border-hairline bg-panel-raised py-1 shadow-xl">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[11px] text-fg-muted hover:bg-panel-hover"
            onClick={() => {
              setMenuOpen(false);
              void checkConnection();
            }}
          >
            Check connection
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[11px] text-amber-400 hover:bg-panel-hover"
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
          >
            Sign out of YouTube
          </button>
        </div>
      ) : null}
    </div>
  );
}
