/**
 * File: PreviewPanel.tsx
 * Path: src/renderer/src/features/player/components/PreviewPanel.tsx
 * Description: The preview. No Clip or Video tab: it follows the selection. Header with the time on
 *   the left and the total on the right, the video, one thin track, transport A, and over the
 *   picture the end card when the video finishes. The same video well goes full screen.
 */
import { motion } from "framer-motion";
import { BoxArrowUpRight, CameraVideo, ExclamationTriangle } from "react-bootstrap-icons";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useFlagsState } from "../../../shared/hooks/useFlagsState";
import { useTimelineView } from "../hooks/useTimelineView";
import { usePreviewController } from "../hooks/usePreviewController";
import { formatLength } from "../../../shared/utils/segments";
import { clipPosition, clockTime } from "../utils/transport";
import { siteName, sourceLinkFor, streamSiteOf } from "../../../shared/utils/videoSource";
import EndCard from "./EndCard";
import FullScreenBar from "./FullScreenBar";
import PreparingLine from "./PreparingLine";
import PlayerControls from "./PlayerControls";
import Scrubber from "./Scrubber";

// Electron's window-open handler routes this to the system browser; in a normal browser it opens
// a new tab.
function openExternal(id: string) {
  window.open(sourceLinkFor(id), "_blank", "noopener");
}

export default function PreviewPanel() {
  const host = usePanelHost();
  const c = usePreviewController(host.onNextVideo);
  const { player, videoId, info } = c;
  const { flags } = useFlagsState(videoId);
  const view = useTimelineView();
  const opening = !!videoId && !info && c.loadingInfo;
  // A Twitch or Kick video has no player here (Liam, 25 Nov): its thumbnail and a link to the site stand in, and
  // the part is picked by typing In and Out. Cutting works as for any link.
  const site = streamSiteOf(videoId);
  const blocked = player.blocked && !site;
  // A joined clip is counted in clip time (0:09 of 0:34); anything else in video time.
  const clipPos = c.sections.length >= 2 ? clipPosition(c.sections, player.currentTime) : null;
  const showEnd = !!videoId && !blocked && player.ended;
  // The words being said now, over the picture. Only a line that is playing, never a stale one.
  const { transcript } = useClipperContext();
  const now = player.currentTime;
  const caption = !showEnd && !opening ? transcript?.find((l) => l.start <= now && now < l.end)?.text : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      data-panel="preview"
      className="relative flex min-h-[0px] min-w-[0px] flex-1 flex-col overflow-visible rounded-panel border border-hairline bg-panel"
    >
      <div className="flex min-h-[0px] flex-1 flex-col gap-[8px] px-[12px] py-[10px]">
        <div className="flex h-[16px] flex-none items-center justify-between text-body leading-[16px] tabular-nums">
          <span className="flex-none">{clipPos ? formatLength(clipPos.at) : clockTime(showEnd ? c.duration : player.currentTime)}</span>
          {/* The video's title, centred between the two times with 20px clear on each side; long ones end in an ellipsis. */}
          <span title={info?.title || undefined} className="mx-[20px] min-w-[0px] flex-1 truncate text-center text-fg">
            {info?.title ?? ""}
          </span>
          <span className="flex-none text-fg-dim">{clipPos ? formatLength(clipPos.total) : clockTime(c.duration)}</span>
        </div>

        <div ref={c.frameRef} className="relative min-h-[0px] flex-1 overflow-hidden rounded-control bg-raised">
          {videoId && !blocked && !site && <div ref={player.containerRef} className="absolute inset-[0px]" />}
          {videoId && site && (
            <div className="absolute inset-[0px]">
              {info?.thumbnail ? <img src={info.thumbnail} alt={info.title ? `Thumbnail for ${info.title}` : "Source thumbnail"} referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-40" /> : null}
              <div className="absolute inset-[0px] flex flex-col items-center justify-center gap-[8px] px-[24px] text-center">
                <span className="text-body text-fg">{siteName(site)} plays on its own page</span>
                <span className="max-w-sm text-meta text-fg-dim">Watch it there, then type the In and Out times below. Cutting works as usual.</span>
                <button type="button" onClick={() => openExternal(videoId)} className="btn mt-[4px]">
                  <BoxArrowUpRight size={12} />
                  <span>Watch on {siteName(site)}</span>
                </button>
              </div>
            </div>
          )}
          {videoId && blocked && (
            <div className="absolute inset-[0px]">
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt={info?.title ? `Thumbnail for ${info.title}` : "Source thumbnail"}
                className="h-full w-full object-cover opacity-40"
                loading="lazy"
              />
              <div className="absolute inset-[0px] flex flex-col items-center justify-center gap-[8px] px-[24px] text-center">
                <ExclamationTriangle size={22} className="text-fg" />
                <span className="text-body text-fg">{player.blockedBy?.owner ? "The owner blocks playback here" : "The preview did not load"}</span>
                <span className="max-w-sm text-meta text-fg-dim">
                  {player.blockedBy?.owner ? "Cutting and downloading still work." : `YouTube would not show it here (code ${player.blockedBy?.code ?? 0}). Cutting and downloading still work.`}
                </span>
                <div className="mt-[4px] flex items-center gap-[8px]">
                  {player.blockedBy?.owner ? null : (
                    <button type="button" onClick={player.reload} className="btn">
                      <span>Try again</span>
                    </button>
                  )}
                  <button type="button" onClick={() => openExternal(videoId)} className="btn">
                    <BoxArrowUpRight size={12} />
                    <span>Watch on YouTube</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {opening && (
            <div className="absolute inset-[0px] flex flex-col items-center justify-center gap-[6px] px-[24px] text-center">
              <span className="text-body text-fg-dim">Opening the video… the transcript follows.</span>
            </div>
          )}
          {!videoId && (
            <div className="absolute inset-[0px] flex flex-col items-center justify-center gap-[8px] text-fg-dim">
              <CameraVideo size={22} />
              <span className="text-meta">Paste a link to preview it</span>
            </div>
          )}
          {caption ? (
            <span
              className={`pointer-events-none absolute left-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 rounded-chip bg-overlay-75 text-center ${
                c.fullScreen ? "bottom-[130px] px-[18px] py-[6px] text-drawer-title font-normal leading-[22px]" : "bottom-[11px] px-[10px] py-[5px] text-body leading-[16px]"
              }`}
            >
              {caption}
            </span>
          ) : null}
          {showEnd ? (
            <EndCard day={host.day} onNextVideo={host.onNextVideo} onOpenBank={host.onOpenBank} onOpenVideo={host.onOpenVideo} />
          ) : null}
          {c.fullScreen ? (
            <FullScreenBar c={c} flags={flags} />
          ) : null}
        </div>

        {opening ? <PreparingLine /> : null}
        {videoId && !blocked && !site ? (
          <>
            <Scrubber
              duration={c.duration}
              playhead={player.currentTime}
              range={c.range}
              flags={flags}
              view={view}
              joined={c.sections}
              onSeek={(t) => player.seekTo(t)}
            />
            <PlayerControls c={c} />
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
