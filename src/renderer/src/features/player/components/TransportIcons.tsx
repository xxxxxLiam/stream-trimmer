/**
 * File: TransportIcons.tsx
 * Path: src/renderer/src/features/player/components/TransportIcons.tsx
 * Description: The preview transport's icons, drawn as on the Workspace board (16 grid, 1.4 stroke).
 */
import type { SVGProps } from "react";

function Glyph({ size = 16, children, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const LoopIcon = () => (
  <Glyph>
    <path d="M3 6h9l-2-2M13 10H4l2 2" />
  </Glyph>
);
export const BackIcon = () => (
  <Glyph size={18}>
    <path d="M3 8a5 5 0 105-5H5M5 1v3h3" />
  </Glyph>
);
export const ForwardIcon = () => (
  <Glyph size={18}>
    <path d="M13 8a5 5 0 11-5-5h3M11 1v3H8" />
  </Glyph>
);
export const PlayIcon = () => (
  <Glyph size={14}>
    <path d="M5.5 3.5v9l7-4.5z" fill="currentColor" />
  </Glyph>
);
export const PauseIcon = () => (
  <Glyph size={14}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Glyph>
);
export const VolumeIcon = ({ muted = false }: { muted?: boolean }) => (
  <Glyph>
    <path d="M3 6v4h2.5L9 13V3L5.5 6z" />
    {muted ? <path d="M11 6l3 4M14 6l-3 4" /> : <path d="M11.5 5.5a3.5 3.5 0 010 5" />}
  </Glyph>
);
export const FullScreenIcon = () => (
  <Glyph>
    <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" />
  </Glyph>
);
export const ExitFullScreenIcon = () => (
  <Glyph>
    <path d="M6 3v3H3M10 3v3h3M6 13v-3H3M10 13v-3h3" />
  </Glyph>
);
export const CaretIcon = () => (
  <svg
    width={10}
    height={10}
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M2 3.5l3 3 3-3" />
  </svg>
);
