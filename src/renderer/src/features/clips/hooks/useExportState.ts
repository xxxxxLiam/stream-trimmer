/**
 * File: useExportState.ts
 * Path: src/renderer/src/features/clips/hooks/useExportState.ts
 * Description: The Export panel's own state: the selected moment, the one being made, and the
 *   clip just finished that can still be undone.
 */
import { useState } from "react";
import { UNDO_SECONDS } from "../utils/exportRows";

export type FinishedClip = { entryId: string; name: string; endsAt: number };

export function useExportState() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [makingName, setMakingName] = useState("New clip");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState<FinishedClip | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(UNDO_SECONDS);
  return {
    selectedId, setSelectedId,
    makingName, setMakingName,
    notice, setNotice,
    importing, setImporting,
    finished, setFinished,
    secondsLeft, setSecondsLeft,
  };
}

export type ExportState = ReturnType<typeof useExportState>;
