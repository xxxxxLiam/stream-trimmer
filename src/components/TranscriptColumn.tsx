/**
 * File: TranscriptColumn.tsx
 * Path: src/components/TranscriptColumn.tsx
 * Description: Left column (FIND). Phase A stub: hosts the legacy transcript dock.
 */
import TranscriptDock from "./TranscriptDock";

export type TranscriptColumnProps = { className?: string };

// TODO(B3): replaced by transcript agent (windowed transcript, whole-transcript search).
export default function TranscriptColumn({ className }: TranscriptColumnProps) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col p-4 ${className ?? ""}`}>
      <TranscriptDock />
    </div>
  );
}
