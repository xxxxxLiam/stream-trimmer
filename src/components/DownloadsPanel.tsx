/**
 * File: DownloadsPanel.tsx
 * Path: src/components/DownloadsPanel.tsx
 * Description: Persisted download history with reveal-in-folder and per-row removal.
 */
import { useEffect, useState } from "react";
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

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-fg-muted">
          <Clock size={12} />
          <span>
            {downloads.length === 0
              ? "No downloads yet"
              : `${downloads.length} saved ${downloads.length === 1 ? "item" : "items"}`}
          </span>
        </div>
        {downloads.length > 0 && (
          <button
            type="button"
            onClick={clearDownloads}
            className="btn text-[12px]"
          >
            <Trash size={12} />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {downloads.length === 0 ? (
        <div className="rounded-row border border-dashed border-hairline px-3 py-6 text-center text-[12px] text-fg-faint">
          Clips and exports you save will be listed here with a link straight to
          their folder.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {downloads.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="group flex items-center gap-3 rounded-row border border-hairline bg-panel-raised px-3 py-2"
              >
                <KindIcon kind={entry.kind} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-fg">
                    {entry.label}
                  </span>
                  <span className="block truncate text-[10px] text-fg-faint">
                    {formatWhen(entry.savedAt)}
                    {entry.dir ? ` · ${labelForDir(entry.dir)}` : ""}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </span>
                  {entry.path && (
                    <span className="block truncate text-[10px] text-fg-faint">
                      {entry.path}
                    </span>
                  )}
                </div>
                {isElectron && entry.path && (
                  <button
                    type="button"
                    onClick={() => revealDownload(entry)}
                    className="btn shrink-0 text-[12px]"
                    title="Show in folder"
                  >
                    <FolderSymlink size={12} />
                    <span>View</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeDownload(entry.id)}
                  className="shrink-0 rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
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
