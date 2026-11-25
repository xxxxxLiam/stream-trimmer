/**
 * File: TransportIcons.tsx
 * Path: src/renderer/src/features/player/components/TransportIcons.tsx
 * Description: The preview transport's icons, Bootstrap Icons at the sizes the Workspace board uses.
 */
import {
  ArrowClockwise,
  ArrowCounterclockwise,
  ChevronDown,
  Fullscreen,
  FullscreenExit,
  PauseFill,
  PlayFill,
  Repeat,
  VolumeMute,
  VolumeUp,
} from "react-bootstrap-icons";
import { glyph } from "../../../shared/components/icons";

const Loop = glyph(Repeat);
const Back = glyph(ArrowCounterclockwise, 18);
const Forward = glyph(ArrowClockwise, 18);
const Play = glyph(PlayFill, 14);
const Pause = glyph(PauseFill, 14);
const Volume = glyph(VolumeUp);
const Muted = glyph(VolumeMute);
const Full = glyph(Fullscreen);
const ExitFull = glyph(FullscreenExit);
const Caret = glyph(ChevronDown, 10);

export const LoopIcon = () => <Loop />;
export const BackIcon = () => <Back />;
export const ForwardIcon = () => <Forward />;
export const PlayIcon = () => <Play />;
export const PauseIcon = () => <Pause />;
export const VolumeIcon = ({ muted = false }: { muted?: boolean }) => (muted ? <Muted /> : <Volume />);
export const FullScreenIcon = () => <Full />;
export const ExitFullScreenIcon = () => <ExitFull />;
export const CaretIcon = () => <Caret />;
