/**
 * File: DownloadsPanel.tsx
 * Path: src/components/DownloadsPanel.tsx
 * Description: Persisted download history with reveal-in-folder and per-row removal.
 */
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  FolderSymlink,
  FiletypeCsv,
  Film,
  Trash,
  X,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { apiUrl } from "../lib/clip";
import DragOutHandle from "./DragOutHandle";
import type { DownloadEntry } from "../lib/downloads";

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function KindIcon({ kind }: { kind: DownloadEntry["kind"] }) {
  if (kind === "clip") return <Film size={14} className="text-accent" />;
  return <FiletypeCsv size={14} className="text-accent" />;
}

export default function DownloadsPanel() {
  const {
    downloads,
    revealDownload,
    removeDownload,
    clearDownloads,
    labelForDir,
    isElectron,
  } = useClipperContext();

  // Unfinished downloads and exports are kept so a failed run can pick up
  // where it stopped; this shows how much room they take and offers to clear.
  const [cache, setCache] = useState<{ folders: number; bytes: number; protectedFolders?: number } | null>(
    null,
  );
  const [clearing, setClearing] = useState(false);

  const refreshCache = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/cache/usage"));
      if (!res.ok) return;
      setCache((await res.json()) as { folders: number; bytes: number; protectedFolders?: number });
    } catch {
      setCache(null);
    }
  }, []);

  useEffect(() => {
    void refreshCache();
  }, [refreshCache, downloads]);

  const clearCache = useCallback(async () => {
    setClearing(true);
    try {
      await fetch(apiUrl("/api/cache/clear"), { method: "POST" });
    } catch {
      /* nothing to report — the usage line refreshes either way */
    } finally {
      setClearing(false);
      void refreshCache();
    }
  }, [refreshCache]);

  // Files can be moved or deleted outside the app, so probe once per mount
  // (and whenever the list changes) rather than on every render.
  const [missing, setMissing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const probe = window.electronAPI?.fileExists;
    if (!isElectron || !probe) return;
    let cancelled = false;

    void (async () => {
      const results: Record<string, boolean> = {};
      for (const entry of downloads) {
        if (!entry.path) continue;
        try {
          results[entry.id] = !(await probe(entry.path));
        } catch {
          results[entry.id] = false;
        }
      }
      if (!cancelled) setMissing(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [isElectron, downloads]);


  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-fg-dim">
          <Clock size={12} />
          <span>
            {downloads.length === 0
              ? "Nothing saved yet"
              : `${downloads.length} saved ${downloads.length === 1 ? "file" : "files"}`}
          </span>
        </div>
        {downloads.length > 0 && (
          <button
            type="button"
            onClick={clearDownloads}
            className="btn text-[12px]"
          >
            <Trash size={12} />
            <span>Clear list</span>
          </button>
        )}
      </div>

      {cache && cache.bytes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-hairline bg-panel-raised px-3 py-2">
          <span className="min-w-0 text-meta text-fg-dim">
            {formatBytes(cache.bytes)} of unfinished downloads kept so a failed
            cut or export can resume. Clearing leaves anything still running,
            and clips waiting to be saved, alone.
          </span>
          <button
            type="button"
            onClick={clearCache}
            disabled={clearing}
            className="btn shrink-0 text-[12px]"
          >
            <Trash size={12} />
            <span>{clearing ? "Clearing…" : "Clear unfinished"}</span>
          </button>
        </div>
      )}

      {downloads.length === 0 ? (
        <div className="rounded-control border border-dashed border-hairline px-3 py-6 text-center text-[12px] text-fg-dim">
          Saved clips and exports are listed here, with a shortcut to their folder.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {downloads.map((entry, rowIndex) => (
              <motion.li
                key={entry.id}
                id={rowIndex === 0 ? "ui-saved-clip" : undefined}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className={`group flex items-center gap-3 rounded-control border border-hairline bg-panel-raised px-3 py-2 ${
                  missing[entry.id] ? "opacity-60" : ""
                }`}
              >
                <KindIcon kind={entry.kind} />
                <DragOutHandle
                  path={entry.path}
                  isElectron={isElectron}
                  exists={!missing[entry.id]}
                  label={entry.label}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-fg">
                    {entry.label}
                  </span>
                  <span className="block truncate text-meta text-fg-dim">
                    {formatWhen(entry.savedAt)}
                    {entry.dir ? ` · ${labelForDir(entry.dir)}` : ""}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </span>
                  {entry.path && (
                    <span className="block truncate text-meta text-fg-dim">
                      {entry.path}
                    </span>
                  )}
                  {missing[entry.id] && (
                    <span className="block text-meta text-fg-dim">
                      File missing. It was moved or deleted.
                    </span>
                  )}
                </div>
                {isElectron && entry.path && !missing[entry.id] && (
                  <button
                    type="button"
                    onClick={() => revealDownload(entry)}
                    className="btn shrink-0 text-[12px]"
                    title="Show folder"
                  >
                    <FolderSymlink size={12} />
                    <span>Show folder</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeDownload(entry.id)}
                  className="shrink-0 rounded p-1 text-fg-dim opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                  title="Remove from list"
                  aria-label={`Remove ${entry.label} from list`}
                >
                  <X size={14} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
