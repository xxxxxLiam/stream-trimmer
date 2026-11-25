/**
 * File: PlayerControls.tsx
 * Path: src/renderer/src/features/player/components/PlayerControls.tsx
 * Description: Transport A: loop and speed on the left, back 5, play and forward 5 in the middle,
 *   volume and full screen on the right. Hover labels carry the keys.
 */
import type { PreviewController } from "../hooks/usePreviewController";
import { hoverLabel, isMacLike } from "../utils/transport";
import TransportButton from "./TransportButton";
import {
  BackIcon,
  ForwardIcon,
  FullScreenIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  VolumeIcon,
} from "./TransportIcons";

export default function PlayerControls({ c }: { c: PreviewController }) {
  const { player } = c;
  const mac = isMacLike();
  return (
    <div className="relative flex flex-none items-center justify-between">
      <span className="flex gap-[10px]">
        <TransportButton
          label={hoverLabel("loop", mac)}
          name="Loop"
          active={c.loop}
          pressed={c.loop}
          disabled={!player.ready || c.sections.length === 0}
          onClick={c.toggleLoop}
        >
          <LoopIcon />
        </TransportButton>
        <TransportButton label={hoverLabel("speed", mac)} name="Speed" onClick={c.cycleSpeed}>
          {player.speed}x
        </TransportButton>
      </span>
      <span className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[14px]">
        <TransportButton look="ghost" label={hoverLabel("back", mac)} name="Back 5 seconds" onClick={() => c.step(-1)}>
          <BackIcon />
        </TransportButton>
        <TransportButton
          look="play"
          label={hoverLabel("play", mac)}
          name={player.playing ? "Pause" : "Play"}
          disabled={!player.ready}
          onClick={c.togglePlay}
        >
          {player.playing ? <PauseIcon /> : <PlayIcon />}
        </TransportButton>
        <TransportButton look="ghost" label={hoverLabel("forward", mac)} name="Forward 5 seconds" onClick={() => c.step(1)}>
          <ForwardIcon />
        </TransportButton>
      </span>
      <span className="flex gap-[10px]">
        <TransportButton label={hoverLabel("volume", mac)} name="Volume" pressed={player.muted} onClick={player.toggleMute}>
          <VolumeIcon muted={player.muted} />
        </TransportButton>
        <TransportButton label={hoverLabel("fullscreen", mac)} name="Full screen" onClick={c.toggleFullScreen}>
          <FullScreenIcon />
        </TransportButton>
      </span>
    </div>
  );
}
