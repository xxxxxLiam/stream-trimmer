/**
 * File: useChannelExport.ts
 * Path: src/hooks/useChannelExport.ts
 * Description: State for the channel profile exporter — form, SSE progress, CSV writing.
 */
import { useCallback, useRef, useState } from "react";
import { apiUrl, parseJson } from "../lib/clip";
import {
  ALL_PARTS,
  anyPartSelected,
  buildExportFiles,
  buildExportFolderName,
  isLikelyChannelUrl,
  isPathDelivery,
  parseChannelLimit,
  type ChannelContentType,
  type ChannelExportProgress,
  type ChannelExportResponse,
  type ChannelLimit,
  type ChannelPart,
  type ChannelParts,
} from "../lib/channel";
import { CHANNEL_PASSCODE_HASH } from "../lib/channelLock";
import { addDownload } from "../lib/downloads";
import { cookiePayload } from "../lib/youtubeConnection";

export interface ChannelExportResult {
  folder: string;
  path: string;
  videos: number;
  comments: number;
  transcripts: number;
  /** Which parts the run covered, so the summary only reports on those. */
  parts: ChannelParts;
  cancelled: boolean;
}

export function useChannelExport(options: {
  isElectron: boolean;
  saveDir: string | null;
}) {
  const { isElectron, saveDir } = options;

  const [channelUrl, setChannelUrl] = useState("");
  const [contentType, setContentType] = useState<ChannelContentType>("all");
  // Kept as the raw field text, so a half-typed or cleared count can be shown
  // back as an error rather than silently becoming some other number.
  const [limitText, setLimitText] = useState("100");
  const [exportAll, setExportAll] = useState(false);
  // What to collect. Everything, until you say otherwise.
  const [parts, setParts] = useState<ChannelParts>(ALL_PARTS);
  const [fresh, setFresh] = useState(false);

  const togglePart = useCallback((key: ChannelPart, on: boolean) => {
    setParts((current) => ({ ...current, [key]: on }));
  }, []);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ChannelExportProgress | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChannelExportResult | null>(null);

  const jobIdRef = useRef<string | null>(null);

  const parsedLimit = parseChannelLimit(exportAll ? "all" : limitText);
  // null while the field holds something unusable — the panel shows the run
  // estimate off this, and startExport reports the reason.
  const limit: ChannelLimit | null = parsedLimit.ok ? parsedLimit.limit : null;

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
    const budget = parseChannelLimit(exportAll ? "all" : limitText);
    if (!budget.ok) {
      setError(budget.reason);
      return;
    }
    if (!anyPartSelected(parts)) {
      setError(
        "Pick at least one thing to export — video details, comments or transcripts.",
      );
      return;
    }
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

    // The desktop app has the engine write the CSVs and just moves the files.
    // Routing them through a JSON body and back across IPC is what made a
    // whole-channel export run out of memory.
    const deliverPath = Boolean(
      isElectron && window.electronAPI?.saveExport && saveDir,
    );

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
            limit: budget.limit,
            includeVideoDetails: parts.videoDetails,
            includeComments: parts.comments,
            includeTranscripts: parts.transcripts,
            fresh,
            deliver: deliverPath ? "path" : "rows",
            ...cookiePayload(),
          }),
        },
      );
      const data = await parseJson<ChannelExportResponse>(res);
      if (!res.ok) throw new Error(data.error || "Export failed");

      const folder = buildExportFolderName(data.channel.name);
      let savedPath = "";
      let counts = { videos: 0, comments: 0, transcripts: 0 };

      if (isPathDelivery(data)) {
        counts = data.counts;
        // videos.csv is absent when details weren't asked for, but the run
        // still covered that many videos.
        counts.videos = data.channel.exported;
        const saved = await window.electronAPI!.saveExport!({
          dirPath: saveDir!,
          folder,
          files: data.files.map((f) => ({ name: f.name, path: f.path })),
        });
        if (!saved.ok) throw new Error(saved.error);
        savedPath = saved.path ?? "";
      } else {
        counts = {
          videos: data.channel.exported,
          comments: data.comments.length,
          transcripts: data.transcripts.length,
        };
        const files = buildExportFiles(data);
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
      }

      addDownload({
        kind: "export",
        label: folder,
        path: savedPath,
        dir: savedPath ? saveDir : null,
        detail: [
          `${counts.videos} videos`,
          parts.comments && `${counts.comments} comments`,
          parts.transcripts && `${counts.transcripts} transcripts`,
        ]
          .filter(Boolean)
          .join(" · "),
      });


      setResult({
        folder,
        path: savedPath,
        videos: counts.videos,
        comments: counts.comments,
        transcripts: counts.transcripts,
        parts: data.parts ?? parts,
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
    limitText,
    exportAll,
    parts,
    fresh,
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
    limitText,
    setLimitText,
    exportAll,
    setExportAll,
    parts,
    togglePart,
    fresh,
    setFresh,
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
