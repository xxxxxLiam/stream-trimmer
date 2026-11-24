/**
 * File: useExportState.ts
 * Path: src/renderer/src/features/clips/hooks/useExportState.ts
 * Description: The Export panel's own state: the selected moment, the one being made, and the
 *   clip just finished that can still be undone.
 */
import { useRef, useState } from "react";
import type { Segment } from "../../../shared/utils/segments";
import type { ClipFailureKind } from "../utils/clipFailure";
import { UNDO_SECONDS } from "../utils/exportRows";

export type FinishedClip = { entryId: string; name: string; endsAt: number };

/** What was being made, kept so a failure can name it and Retry can make it again. */
export type ClipAttempt = { name: string; segments: Segment[]; bankId?: string };
export type FailedClip = ClipAttempt & { kind: ClipFailureKind; attempts: number; message: string; code?: string; reason?: string };

export function useExportState() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [makingName, setMakingName] = useState("New clip");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState<FinishedClip | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(UNDO_SECONDS);
  const [failed, setFailed] = useState<FailedClip | null>(null);
  const attempt = useRef<ClipAttempt | null>(null);
  const failCount = useRef({ key: "", count: 0 });
  return {
    selectedId, setSelectedId,
    makingName, setMakingName,
    notice, setNotice,
    importing, setImporting,
    finished, setFinished,
    secondsLeft, setSecondsLeft,
    failed, setFailed, attempt, failCount,
  };
}

export type ExportState = ReturnType<typeof useExportState>;
