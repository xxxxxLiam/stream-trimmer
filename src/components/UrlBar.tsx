/**
 * File: UrlBar.tsx
 * Path: src/components/UrlBar.tsx
 * Description: YouTube URL input with an explicit Search button.
 */
import { Search } from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";

export default function UrlBar() {
  const { url, setUrl, loadInfo, loadingInfo } = useClipperContext();

  return (
    <div className="group flex items-center gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-1.5 transition-colors focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgba(255,99,99,0.18)]">
      <Search className="shrink-0 text-fg-muted" size={14} />
      <input
        type="url"
        placeholder="Paste a YouTube URL…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") loadInfo();
        }}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-fg outline-none"
      />
      <button
        type="button"
        onClick={loadInfo}
        disabled={!url || loadingInfo}
        className="flex items-center gap-1.5 rounded-chip px-2 py-1 text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
        aria-label="Search"
      >
        <span className="text-[12px]">Search</span>
        <span className="kbd">↵</span>
      </button>
    </div>
  );
}