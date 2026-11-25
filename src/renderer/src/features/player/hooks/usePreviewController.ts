/**
 * File: usePreviewController.ts
 * Path: src/renderer/src/features/player/hooks/usePreviewController.ts
 * Description: The only hook the preview components call. Joins the player, the open video's range,
 *   the clip being built and the preview's own switches into one view model.
 */
import { isStreamSource } from "../../../shared/utils/videoSource";
import { markByHand } from "../utils/rangeOrigin";
import { useMemo, useRef } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import type { Range } from "../../../shared/utils/segments";
import { usePickedRange } from "./usePickedRange";
import { useYouTubePlayerController } from "./useYouTubePlayerController";
import { usePreviewState } from "./usePreviewState";
import { usePreviewEffects } from "./usePreviewEffects";
import { clipSections } from "../utils/clipDestination";
import { nextSpeed, stepTarget, STEP_SECONDS } from "../utils/transport";

export function usePreviewController(onNextVideo: () => void) {
  const { info, loadingInfo, videoId, duration, seekRequest, setStartFromSeconds, setEndFromSeconds } =
    useClipperContext();
  const tabActive = useIsTabActive();
  // Twitch and Kick links have no YouTube player to build: the preview says so and links to the site.
  const player = useYouTubePlayerController(isStreamSource(videoId) ? null : videoId);
  const state = usePreviewState();
  const { segments } = useSegmentsState();
  const frameRef = useRef<HTMLDivElement | null>(null);

  const range = usePickedRange();
  // A joined clip plays its sections in order; otherwise the marked range.
  const sections = useMemo<readonly Range[]>(
    () => clipSections(segments, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, range?.start, range?.end],
  );

  const toggleLoop = () => {
    if (!state.loop && sections.length > 0) player.seekTo(sections[0].start, true);
    state.setLoop((v) => !v);
  };

  usePreviewEffects({
    player,
    videoId,
    tabActive,
    duration,
    seekRequest,
    loop: state.loop,
    setLoop: state.setLoop,
    sections,
    fullScreen: state.fullScreen,
    setFullScreen: state.setFullScreen,
    setBarVisible: state.setBarVisible,
    frameRef,
    toggleLoop,
    onNextVideo,
    setIn: () => info && (markByHand(), setStartFromSeconds(Math.floor(player.currentTime))),
    setOut: () => info && (markByHand(), setEndFromSeconds(Math.ceil(player.currentTime))),
  });

  const toggleFullScreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return {
    info,
    loadingInfo,
    videoId,
    player,
    duration,
    range,
    sections,
    frameRef,
    loop: state.loop,
    fullScreen: state.fullScreen,
    barVisible: state.barVisible,
    toggleLoop,
    toggleFullScreen,
    cycleSpeed: () => player.setSpeed(nextSpeed(player.speed)),
    step: (dir: 1 | -1) => player.seekTo(stepTarget(player.currentTime, dir * STEP_SECONDS, duration)),
    togglePlay: () => (player.playing ? player.pause() : player.play()),
  };
}

export type PreviewController = ReturnType<typeof usePreviewController>;
