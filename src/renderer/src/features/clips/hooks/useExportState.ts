/**
 * File: useExportState.ts
 * Path: src/renderer/src/features/clips/hooks/useExportState.ts
 * Description: The Export panel's own state: the selected moment, the one being made, and the
 *   clip just finished that can still be undone.
 */
import { useRef, useState } from "react";
import type { Segment } from "../../../shared/utils/segments";
import type { ClipFailureKind } from "../utils/clipFailure";

/** Adds a finished clip's Undo window; one already there for the same file is kept as it is. */
export const withFinished = (list: FinishedClip[], f: FinishedClip): FinishedClip[] =>
  list.some((x) => x.entryId === f.entryId) ? list : [f, ...list];

export type FinishedClip = { entryId: string; name: string; endsAt: number };

/** What was being made, kept so a failure can name it and Retry can make it again. */
export type ClipAttempt = { name: string; segments: Segment[]; bankId?: string };
export type FailedClip = ClipAttempt & { kind: ClipFailureKind; attempts: number; message: string; code?: string; reason?: string };

export function useExportState() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // Every clip just made keeps its own Undo window, newest first, until its own seconds run out.
  const [finished, setFinished] = useState<FinishedClip[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState<FailedClip | null>(null);
  const attempt = useRef<ClipAttempt | null>(null);
  const failCount = useRef({ key: "", count: 0 });
  return {
    selectedId, setSelectedId,
    notice, setNotice,
    finished, setFinished,
    now, setNow,
    failed, setFailed, attempt, failCount,
  };
}

export type ExportState = ReturnType<typeof useExportState>;
