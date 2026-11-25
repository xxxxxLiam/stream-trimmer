/**
 * File: useCommentsMutations.ts
 * Path: src/renderer/src/modules/clipper/hooks/useCommentsMutations.ts
 * Description: Exports the video's comments as a CSV.
 */
import { useCallback, useState } from "react";
import { normalizeYouTubeUrl, parseJson, apiUrl, commentsToCsv, sanitizeFilename, type VideoInfo, type CommentsResponse } from "../../../shared/utils/clip";
import { addDownload } from "../../../shared/utils/downloads";
import { type SavedFiles } from "./useSavedFilesState";
import { cookiePayload } from "../../../shared/utils/youtubeConnection";

export function useCommentsMutations({
  info,
  url,
  isElectron,
  saveDir,
  setError,
  setLastSavedPath,
  setSavedNotice,
}: {
  info: VideoInfo | null;
  url: string;
  isElectron: boolean;
  saveDir: string | null;
  setError: (v: string) => void;
  setLastSavedPath: SavedFiles["setLastSavedPath"];
  setSavedNotice: SavedFiles["setSavedNotice"];
}) {
  // Comment export state.
  const [exportingComments, setExportingComments] = useState(false);
  const [commentsNote, setCommentsNote] = useState<string>("");

  const exportComments = useCallback(async () => {
    if (!info) {
      setError("Load a video first");
      return;
    }
    setError("");
    setCommentsNote("");
    setExportingComments(true);
    try {
      const res = await fetch(apiUrl("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Metadata, captions and comments need the session as much as the
        // download does — without it YouTube answers "Sign in to confirm
        // you're not a bot" and the app looks signed out when it isn't.
        body: JSON.stringify({
          url: normalizeYouTubeUrl(url),
          ...cookiePayload(url),
        }),
      });
      const data = await parseJson<CommentsResponse & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to fetch comments");
      if (data.commentsDisabled) {
        setCommentsNote("Comments are disabled for this video");
        return;
      }
      if (!data.comments || data.comments.length === 0) {
        setCommentsNote("No comments found for this video");
        return;
      }
      const csv = commentsToCsv(data.comments);
      const filename = `${sanitizeFilename(info.title)}-comments.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      if (isElectron && window.electronAPI && saveDir) {
        const arr = await blob.arrayBuffer();
        const result = await window.electronAPI.saveFile({
          dirPath: saveDir,
          filename,
          data: arr,
        });
        if (!result.ok) throw new Error(result.error);
        setLastSavedPath(result.path ?? null);
        setSavedNotice({
          kind: "comments",
          path: result.path ?? "",
          label: filename,
        });
        addDownload({
          kind: "comments",
          label: filename,
          path: result.path ?? "",
          dir: saveDir,
        });
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking on this tick cancels the download the click just started:
        // the browser has not read the blob yet, and the request fails with
        // a bare ERR_FAILED. Hold the URL until the transfer can have run.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        setSavedNotice({ kind: "comments", path: "", label: filename });
        addDownload({
          kind: "comments",
          label: filename,
          path: "",
          dir: null,
        });
      }
      setCommentsNote(
        `Exported ${data.comments.length} comments (dislikes unavailable from YouTube)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export comments");
    } finally {
      setExportingComments(false);
    }
  }, [info, url, isElectron, saveDir]);

  return { exportComments, exportingComments, commentsNote };
}
