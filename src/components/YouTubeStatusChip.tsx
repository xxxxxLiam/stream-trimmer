/**
 * File: YouTubeStatusChip.tsx
 * Path: src/components/YouTubeStatusChip.tsx
 * Description: Compact top-bar chip showing the shared YouTube connection state.
 */
import { useYouTubeConnection } from "../lib/youtubeConnection";

export default function YouTubeStatusChip({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const { connected, busy } = useYouTubeConnection();
  const label = busy
    ? "Connecting…"
    : connected
      ? "YouTube connected"
      : "Not connected";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={
        connected
          ? "Signed in — higher quality downloads unlocked"
          : "Connect YouTube to unlock 1080p+ downloads"
      }
      className={`flex items-center gap-1.5 rounded-chip border border-hairline px-2 py-1 text-[11px] transition-colors hover:bg-panel-hover ${
        connected ? "text-fg-muted" : "text-amber-400"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          busy
            ? "animate-pulse bg-fg-faint"
            : connected
              ? "bg-emerald-400"
              : "bg-amber-400"
        }`}
      />
      {label}
    </button>
  );
}
