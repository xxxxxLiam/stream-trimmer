/**
 * File: FullScreenBar.tsx
 * Path: src/renderer/src/features/player/components/FullScreenBar.tsx
 * Description: The full-screen bar. Slides up on mouse movement and hides after about 3 seconds,
 *   leaving only the video. Thin track, time and total, then the transport and the split Clip.
 */
import type { PreviewController } from "../hooks/usePreviewController";
import { clockTime, hoverLabel, isMacLike } from "../utils/transport";
import ClipButton from "./ClipButton";
import Scrubber from "./Scrubber";
import TransportButton from "./TransportButton";
import {
  BackIcon,
  ExitFullScreenIcon,
  ForwardIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  VolumeIcon,
} from "./TransportIcons";

type Props = {
  c: PreviewController;
  flags: readonly number[];
};

export default function FullScreenBar({ c, flags }: Props) {
  const { player } = c;
  const mac = isMacLike();
  return (
    <div
      className={`absolute inset-x-[0px] bottom-[0px] border-t border-hairline bg-panel px-[20px] pb-[10px] pt-[14px] transition-transform duration-150 ${c.barVisible ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
    >
      <Scrubber
        large
        duration={c.duration}
        playhead={player.currentTime}
        range={c.range}
        flags={flags}
        view={null}
        onSeek={(t) => player.seekTo(t)}
      />
      <div className="relative mt-[10px] flex h-target items-center">
        <span className="flex gap-[14px] text-body leading-[16px] tabular-nums">
          <span>{clockTime(player.currentTime)}</span>
          <span className="text-fg-dim">/ {clockTime(c.duration)}</span>
        </span>
        <span className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[8px]">
          <TransportButton labelBelow={false} label={hoverLabel("loop", mac)} name="Loop" active={c.loop} pressed={c.loop} onClick={c.toggleLoop}>
            <LoopIcon />
          </TransportButton>
          <TransportButton label={hoverLabel("speed", mac)} name="Speed" onClick={c.cycleSpeed}>
            {player.speed}x
          </TransportButton>
          <TransportButton look="ghost" label={hoverLabel("back", mac)} name="Back 5 seconds" onClick={() => c.step(-1)}>
            <BackIcon />
          </TransportButton>
          <TransportButton look="play" label={hoverLabel("play", mac)} name={player.playing ? "Pause" : "Play"} onClick={c.togglePlay}>
            {player.playing ? <PauseIcon /> : <PlayIcon />}
          </TransportButton>
          <TransportButton look="ghost" label={hoverLabel("forward", mac)} name="Forward 5 seconds" onClick={() => c.step(1)}>
            <ForwardIcon />
          </TransportButton>
          <TransportButton label={hoverLabel("volume", mac)} name="Volume" pressed={player.muted} onClick={player.toggleMute}>
            <VolumeIcon muted={player.muted} />
          </TransportButton>
        </span>
        <span className="ml-auto flex items-center gap-[10px]">
          <ClipButton openUp />
          <TransportButton look="ghost" label="Exit full screen  Esc" name="Exit full screen (Esc)" onClick={c.toggleFullScreen}>
            <ExitFullScreenIcon />
          </TransportButton>
        </span>
      </div>
    </div>
  );
}
