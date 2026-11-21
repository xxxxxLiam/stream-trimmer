/**
 * File: ClipsColumn.tsx
 * Path: src/components/ClipsColumn.tsx
 * Description: Right column (COLLECT). Phase A stub: hosts the legacy downloads list.
 */
import DownloadsPanel from "./DownloadsPanel";

export type ClipsColumnProps = { className?: string };

// TODO(B2/B4): replaced by the clips column (This video / All saved tabs).
export default function ClipsColumn({ className }: ClipsColumnProps) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto p-4 ${className ?? ""}`}>
      <DownloadsPanel />
    </div>
  );
}
