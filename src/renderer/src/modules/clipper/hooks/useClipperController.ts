/**
 * File: useClipperController.ts
 * Path: src/renderer/src/modules/clipper/hooks/useClipperController.ts
 * Description: Central clipper state — URL, info, range, format/quality, transcript, download.
 * Composes the hooks in ./clipper; the shared values (url, info, range text,
 * format, quality, error) live here and are handed to them.
 */
import { useMemo, useState } from "react";
import { extractVideoId, estimateBytes, type ClipFormat, type VideoInfo, isAudioFormat } from "../../../shared/utils/clip";
import { useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { useClipDownloadMutations } from "./useClipDownloadMutations";
import { useClipRangeState } from "./useClipRangeState";
import { useCommentsMutations } from "./useCommentsMutations";
import { useQualityRulesEffects } from "./useQualityRulesEffects";
import { useSaveLocationsState } from "./useSaveLocationsState";
import { useSavedFilesState } from "./useSavedFilesState";
import { useTranscriptQueries } from "./useTranscriptQueries";
import { useVideoInfoQueries } from "./useVideoInfoQueries";

export {
  AUDIO_QUALITIES,
  VIDEO_QUALITIES,
  type DownloadFailureInfo,
  type DownloadOptions,
  type Quality,
} from "../utils/clipperTypes";
export {
  DownloadCancelledError,
  isCancelledResponse,
  isQuietCancel,
  requestEngineCancel,
  videoUrlProblem,
} from "../utils/downloadErrors";

export function useClipperController() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [format, setFormat] = useState<ClipFormat>("mp4");
  const [quality, setQuality] = useState<string>("best");
  // Sign-in lives in an app-wide store shared by every workspace tab; the
  // connection UI is a modal in the shell, not part of this form.
  const connection = useYouTubeConnection();
  const [error, setError] = useState("");

  const isElectron =
    typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);

  const saveLocations = useSaveLocationsState();
  const { saveDir } = saveLocations;
  const savedFiles = useSavedFilesState(isElectron);
  const { setLastSavedPath, setSavedNotice } = savedFiles;

  const videoId = useMemo(() => extractVideoId(url), [url]);
  const range = useClipRangeState({ url, info, startText, endText, setStartText, setEndText, setError });
  const { duration, start, end, validationError } = range;
  useQualityRulesEffects({ connection, format, quality, setQuality });
  const transcript = useTranscriptQueries({
    url,
    videoId,
    start,
    end,
    setError,
    setStartText,
    setEndText,
  });
  const videoInfo = useVideoInfoQueries({ url, videoId, setInfo, setStartText, setEndText, setError });
  const comments = useCommentsMutations({
    info,
    url,
    isElectron,
    saveDir,
    setError,
    setLastSavedPath,
    setSavedNotice,
  });
  const clipDownload = useClipDownloadMutations({
    info,
    url,
    start,
    end,
    format,
    quality,
    isElectron,
    saveDir,
    connection,
    validationError,
    setError,
    setLastSavedPath,
    setSavedNotice,
  });

  // Live size estimate (bytes) for the selected range/format/quality.
  const estimatedBytes = useMemo(() => {
    if (!info?.bitrates) return 0;
    const table = isAudioFormat(format) ? info.bitrates.mp3 : info.bitrates.mp4;
    const kbps = table?.[quality] ?? 0;
    return estimateBytes(kbps, Math.max(0, end - start));
  }, [info, format, quality, start, end]);

  return {
    url,
    setUrl,
    info,
    startText,
    setStartText,
    endText,
    setEndText,
    format,
    setFormat,
    quality,
    setQuality,
    connection,

    loadingInfo: videoInfo.loadingInfo,
    downloading: clipDownload.downloading,
    downloadProgress: clipDownload.downloadProgress,
    downloadPhase: clipDownload.downloadPhase,
    downloadNote: clipDownload.downloadNote,
    error,
    failure: clipDownload.failure,
    videoId,
    duration,
    start,
    end,
    validationError,
    loadInfo: videoInfo.loadInfo,
    searchNow: videoInfo.searchNow,
    flushAutoLoad: videoInfo.flushAutoLoad,
    download: clipDownload.download,
    pasteInto: range.pasteInto,
    setStartFromSeconds: range.setStartFromSeconds,
    setEndFromSeconds: range.setEndFromSeconds,
    setRangeFromSeconds: range.setRangeFromSeconds,
    showTranscript: transcript.showTranscript,
    toggleTranscript: transcript.toggleTranscript,
    ensureTranscript: transcript.ensureTranscript,
    loadingTranscript: transcript.loadingTranscript,
    transcriptError: transcript.transcriptError,
    transcript: transcript.transcript,
    rangeTranscript: transcript.rangeTranscript,
    filteredTranscript: transcript.filteredTranscript,
    displayTranscript: transcript.displayTranscript,
    transcriptQuery: transcript.transcriptQuery,
    setTranscriptQuery: transcript.setTranscriptQuery,
    setStartFromLine: transcript.setStartFromLine,
    setEndFromLine: transcript.setEndFromLine,
    seekRequest: transcript.seekRequest,
    requestSeek: transcript.requestSeek,
    rangeTranscriptText: transcript.rangeTranscriptText,
    copyTranscript: transcript.copyTranscript,
    estimatedBytes,
    isElectron,
    saveDir,
    saveDirs: saveLocations.saveDirs,
    setSaveDir: saveLocations.setSaveDir,
    removeSaveDir: saveLocations.removeSaveDir,
    pickSaveDir: saveLocations.pickSaveDir,
    saveDirNames: saveLocations.saveDirNames,
    renameSaveDir: saveLocations.renameSaveDir,
    labelForDir: saveLocations.labelForDir,
    downloads: savedFiles.downloads,
    revealDownload: savedFiles.revealDownload,
    removeDownload: savedFiles.removeDownload,
    clearDownloads: savedFiles.clearDownloads,
    lastSavedPath: savedFiles.lastSavedPath,
    revealLastSaved: savedFiles.revealLastSaved,
    savedNotice: savedFiles.savedNotice,
    dismissSavedNotice: savedFiles.dismissSavedNotice,
    revealSaved: savedFiles.revealSaved,
    cancelDownload: clipDownload.cancelDownload,
    exportComments: comments.exportComments,
    exportingComments: comments.exportingComments,
    commentsNote: comments.commentsNote,
  };
}

export type ClipperState = ReturnType<typeof useClipperController>;
