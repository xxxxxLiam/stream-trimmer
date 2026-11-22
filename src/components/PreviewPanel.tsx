/**
 * File: PreviewPanel.tsx
 * Path: src/components/PreviewPanel.tsx
 * Description: Clip tab preview — YouTube player with scrubbing transport controls.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  CameraVideo,
  ExclamationTriangle,
  BoxArrowUpRight,
} from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import { setPlayhead } from "../hooks/useSegments";
import { useIsTabActive } from "../context/WorkspaceContext";
import PlayerControls from "./PlayerControls";

// Electron's window-open handler routes this to the system browser; in a
// normal browser it opens a new tab.
function openExternal(id: string) {
  window.open(`https://www.youtube.com/watch?v=${id}`, "_blank", "noopener");
}

export default function PreviewPanel() {
  const { info, videoId, start, end, seekRequest } = useClipperContext();

  // YouTube IFrame API player — drives scrubbing and in/out points.
  const player = useYouTubePlayer(videoId);
  const embedBlocked = player.blocked;
  const [loopSelection, setLoopSelection] = useState(false);

  // Publish the playhead so the transcript highlight and the timeline follow it. The store is
  // shared across workspace tabs, so only the visible tab may write.
  const tabActive = useIsTabActive();
  useEffect(() => {
    if (tabActive) setPlayhead(player.currentTime);
  }, [tabActive, player.currentTime]);

  // Apply seek requests coming from the transcript or the range slider.
  useEffect(() => {
    if (!seekRequest) return;
    player.seekTo(seekRequest.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce]);

  // Loop playback inside the selected range.
  useEffect(() => {
    if (!loopSelection) return;
    if (player.currentTime >= end || player.currentTime < start - 1) {
      player.seekTo(start, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopSelection, player.currentTime, start, end]);

  useEffect(() => {
    setLoopSelection(false);
  }, [videoId]);

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-4">
      <motion.div
        key="video"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="flex shrink-0 flex-col gap-3"
      >
        <div className="relative mx-auto aspect-video w-full max-w-[80vh] overflow-hidden rounded-panel border border-hairline bg-panel-raised">
          {videoId && !embedBlocked && (
            <div ref={player.containerRef} className="absolute inset-0" />
          )}

          {videoId && embedBlocked && (
            <div className="absolute inset-0">
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt={
                  info?.title ? `Thumbnail for ${info.title}` : "Source thumbnail"
                }
                className="h-full w-full object-cover opacity-40"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <ExclamationTriangle size={22} className="text-accent" />
                <span className="text-[13px] text-fg">
                  The owner blocks playback here
                </span>
                <span className="max-w-sm text-[12px] text-fg-dim">
                  Cutting and downloading still work.
                </span>
                <button
                  type="button"
                  onClick={() => openExternal(videoId)}
                  className="btn mt-1 text-[12px]"
                >
                  <BoxArrowUpRight size={12} />
                  <span>Watch on YouTube</span>
                </button>
              </div>
            </div>
          )}

          {!videoId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg">
              <CameraVideo size={22} />
              <span className="text-[12px]">Paste a link to preview it</span>
            </div>
          )}
        </div>

        {videoId && !embedBlocked && (
          <PlayerControls
            player={player}
            loopSelection={loopSelection}
            onToggleLoop={() => setLoopSelection((v) => !v)}
          />
        )}
      </motion.div>
    </div>
  );
}
