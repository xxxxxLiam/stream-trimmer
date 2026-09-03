/**
 * File: useChannelExport.ts
 * Path: src/hooks/useChannelExport.ts
 * Description: State for the channel profile exporter — form, SSE progress, CSV writing.
 */
import { useCallback, useRef, useState } from "react";
import { apiUrl, parseJson } from "../lib/clip";
import type { CookieBrowser } from "../lib/clip";
import {
  buildExportFiles,
  buildExportFolderName,
  isLikelyChannelUrl,
  CHANNEL_LIMIT_MAX,
  CHANNEL_LIMIT_MIN,
  type ChannelContentType,
  type ChannelExportProgress,
  type ChannelExportResponse,
} from "../lib/channel";
import { CHANNEL_PASSCODE_HASH } from "../lib/channelLock";
import { addDownload } from "../lib/downloads";

export interface ChannelExportResult {
  folder: string;
  path: string;
  videos: number;
  comments: number;
  transcripts: number;
  cancelled: boolean;
}

export function useChannelExport(options: {
  isElectron: boolean;
  saveDir: string | null;
  cookiesFromBrowser?: CookieBrowser;
}) {
  const { isElectron, saveDir, cookiesFromBrowser } = options;

  const [channelUrl, setChannelUrl] = useState("");
  const [contentType, setContentType] = useState<ChannelContentType>("all");
  const [limit, setLimit] = useState(100);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeTranscripts, setIncludeTranscripts] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ChannelExportProgress | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChannelExportResult | null>(null);

  const jobIdRef = useRef<string | null>(null);

  const cancelExport = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      await fetch(apiUrl("/api/channel/export/cancel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
    } catch {
      /* ignore — the request will end on its own */
    }
  }, []);

  const startExport = useCallback(async () => {
    const trimmed = channelUrl.trim();
    if (!isLikelyChannelUrl(trimmed)) {
      setError("Paste a channel link like youtube.com/@handle");
      return;
    }
    if (isElectron && !saveDir) {
      setError("Choose a save folder first");
      return;
    }
    const safeLimit = Math.min(
      CHANNEL_LIMIT_MAX,
      Math.max(CHANNEL_LIMIT_MIN, Math.round(limit) || CHANNEL_LIMIT_MIN),
    );
    setError("");
    setResult(null);
    setExporting(true);
    setProgress({ phase: "listing", current: 0, total: 0 });

    const jobId = `chan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    jobIdRef.current = jobId;
    let es: EventSource | null = null;
    try {
      es = new EventSource(
        apiUrl(
          `/api/channel/export/progress?jobId=${encodeURIComponent(jobId)}`,
        ),
      );
      es.onmessage = (ev) => {
        try {
          setProgress(JSON.parse(ev.data) as ChannelExportProgress);
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* progress is best-effort */
    }

    try {
      const res = await fetch(
        apiUrl(`/api/channel/export?jobId=${encodeURIComponent(jobId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Local parity check so the endpoint isn't callable without the
            // same passcode that unlocks the UI.
            "X-Channel-Key": CHANNEL_PASSCODE_HASH,
          },
          body: JSON.stringify({
            url: trimmed,
            contentType,
            limit: safeLimit,
            includeComments,
            includeTranscripts,
            ...(cookiesFromBrowser ? { cookiesFromBrowser } : {}),
          }),
        },
      );
      const data = await parseJson<ChannelExportResponse>(res);
      if (!res.ok) throw new Error(data.error || "Export failed");

      const files = buildExportFiles(data);
      const folder = buildExportFolderName(data.channel.name);

      let savedPath = "";
      if (isElectron && window.electronAPI?.saveFiles && saveDir) {
        const saved = await window.electronAPI.saveFiles({
          dirPath: saveDir,
          folder,
          files,
        });
        if (!saved.ok) throw new Error(saved.error);
        savedPath = saved.path ?? "";
      } else {
        for (const file of files) {
          const blob = new Blob([file.contents], {
            type: "text/csv;charset=utf-8",
          });
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = `${folder}-${file.name}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(objectUrl);
        }
      }

      setResult({
        folder,
        path: savedPath,
        videos: data.videos.length,
        comments: data.comments.length,
        transcripts: data.transcripts.length,
        cancelled: data.cancelled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      es?.close();
      jobIdRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  }, [
    channelUrl,
    contentType,
    limit,
    includeComments,
    includeTranscripts,
    cookiesFromBrowser,
    isElectron,
    saveDir,
  ]);

  const revealResult = useCallback(() => {
    if (result?.path && window.electronAPI?.showInFolder) {
      void window.electronAPI.showInFolder(result.path);
    }
  }, [result]);

  return {
    channelUrl,
    setChannelUrl,
    contentType,
    setContentType,
    limit,
    setLimit,
    includeComments,
    setIncludeComments,
    includeTranscripts,
    setIncludeTranscripts,
    exporting,
    progress,
    error,
    result,
    startExport,
    cancelExport,
    revealResult,
    dismissResult: useCallback(() => setResult(null), []),
  };
}

export type ChannelExportState = ReturnType<typeof useChannelExport>;
