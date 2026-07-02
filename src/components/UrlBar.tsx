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
    <div className="flex items-stretch border border-white">
      <input
        type="url"
        placeholder="Paste a YouTube URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") loadInfo();
        }}
        className="min-w-0 flex-1 bg-black px-3 py-2.5 text-white outline-none"
      />
      <button
        type="button"
        onClick={loadInfo}
        disabled={!url || loadingInfo}
        className="flex items-center gap-2 border-l border-white px-4 py-2.5 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-white"
        aria-label="Search"
      >
        <Search />
        <span className="hidden sm:inline">Search</span>
      </button>
    </div>
  );
}