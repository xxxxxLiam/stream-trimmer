/**
 * File: UrlBar.tsx
 * Path: src/components/UrlBar.tsx
 * Description: YouTube URL input that auto-searches as soon as the link changes.
 */
import { useEffect, useRef } from "react";
import { Search, ArrowRepeat } from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { useIsTabActive } from "../context/WorkspaceContext";

export default function UrlBar() {
  const { url, setUrl, searchNow, flushAutoLoad, loadingInfo, videoId } =
    useClipperContext();
  const isTabActive = useIsTabActive();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd/Ctrl+L focuses the URL bar (active tab only).
  useEffect(() => {
    if (!isTabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTabActive]);

  return (
    <div className="group flex items-center gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-1.5 transition-colors focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgba(255,99,99,0.18)]">
      {loadingInfo ? (
        <ArrowRepeat className="shrink-0 animate-spin text-accent" size={14} />
      ) : (
        <Search className="shrink-0 text-fg-muted" size={14} />
      )}
      <input
        ref={inputRef}
        type="url"
        placeholder="Paste a YouTube URL — it loads automatically"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onPaste={() => flushAutoLoad()}
        onKeyDown={(e) => {
          if (e.key === "Enter") searchNow();
        }}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-fg outline-none"
      />
      <button
        type="button"
        onClick={searchNow}
        disabled={!videoId || loadingInfo}
        className="flex items-center gap-1.5 rounded-chip px-2 py-1 text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        aria-label="Reload video"
        title="Reload this video"
      >
        <span className="text-[12px]">{loadingInfo ? "Loading" : "Reload"}</span>
      </button>
    </div>
  );
}
