/**
 * File: PreviewPanel.tsx
 * Path: src/renderer/src/features/player/components/PreviewPanel.tsx
 * Description: The preview. No Clip or Video tab: it follows the selection. Header with the time on
 *   the left and the total on the right, the video, one thin track, transport A, and over the
 *   picture the end card when the video finishes. The same video well goes full screen.
 */
import { motion } from "framer-motion";
import { BoxArrowUpRight, CameraVideo, ExclamationTriangle } from "react-bootstrap-icons";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { usePreviewController } from "../hooks/usePreviewController";
import { clockTime } from "../utils/transport";
import EndCard from "./EndCard";
import FullScreenBar from "./FullScreenBar";
import PlayerControls from "./PlayerControls";
import Scrubber from "./Scrubber";

// Electron's window-open handler routes this to the system browser; in a normal browser it opens
// a new tab.
function openExternal(id: string) {
  window.open(`https://www.youtube.com/watch?v=${id}`, "_blank", "noopener");
}

export default function PreviewPanel() {
  const host = usePanelHost();
  const c = usePreviewController(host.onNextVideo);
  const { segments } = useSegmentsState();
  const { player, videoId, info } = c;
  const blocked = player.blocked;
  const showEnd = !!videoId && !blocked && player.ended;
  const clipReason = c.range || segments.length > 0 ? null : "Set an end first: click the timeline or press O";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible rounded-panel border border-hairline bg-panel"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
        <div className="flex flex-none justify-between text-body tabular-nums">
          <span>{clockTime(showEnd ? c.duration : player.currentTime)}</span>
          <span className="text-fg-dim">{clockTime(c.duration)}</span>
        </div>

        <div ref={c.frameRef} className="relative min-h-0 flex-1 overflow-hidden rounded-control bg-raised">
          {videoId && !blocked && <div ref={player.containerRef} className="absolute inset-0" />}
          {videoId && blocked && (
            <div className="absolute inset-0">
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt={info?.title ? `Thumbnail for ${info.title}` : "Source thumbnail"}
                className="h-full w-full object-cover opacity-40"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <ExclamationTriangle size={22} className="text-fg" />
                <span className="text-body text-fg">The owner blocks playback here</span>
                <span className="max-w-sm text-meta text-fg-dim">Cutting and downloading still work.</span>
                <button type="button" onClick={() => openExternal(videoId)} className="btn mt-1">
                  <BoxArrowUpRight size={12} />
                  <span>Watch on YouTube</span>
                </button>
              </div>
            </div>
          )}
          {!videoId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-dim">
              <CameraVideo size={22} />
              <span className="text-meta">Paste a link to preview it</span>
            </div>
          )}
          {showEnd ? (
            <EndCard day={host.day} onNextVideo={host.onNextVideo} onOpenBank={host.onOpenBank} onOpenVideo={host.onOpenVideo} />
          ) : null}
          {c.fullScreen ? (
            <FullScreenBar
              c={c}
              flags={[]}
              clipReason={clipReason}
              onClip={() => host.cutSegments(segments.length > 0 ? segments : c.range ? [c.range] : [])}
              onClipMenu={() => {}}
            />
          ) : null}
        </div>

        {videoId && !blocked ? (
          <>
            <Scrubber
              duration={c.duration}
              playhead={player.currentTime}
              range={c.range}
              flags={[]}
              view={null}
              onSeek={(t) => player.seekTo(t)}
            />
            <PlayerControls c={c} />
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
