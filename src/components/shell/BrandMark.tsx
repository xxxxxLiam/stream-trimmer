/**
 * File: BrandMark.tsx
 * Path: src/components/shell/BrandMark.tsx
 * Description: The product logo — the play triangle with the lightning slice cut
 *   through it. Traced from build/icon.png (the same art as the installer icon)
 *   so the window and the dock show one mark, not two.
 *
 *   Filled, not stroked, so it does not belong to the 16px stroke icon family in
 *   icons.tsx. The slice is a hole in the shape rather than a drawn line, which
 *   is why this reads correctly on any background. Colour comes from
 *   currentColor, defaulting to the accent, so recolouring the theme recolours
 *   the mark with it.
 */
import type { SVGProps } from "react";

/** Natural proportions of the artwork, used to derive width from height. */
const W = 542;
const H = 660;

const PATH =
  "M4287 6502 c-9 -21 -17 -44 -17 -50 0 -6 -13 -33 -30 -59 -16 -26 -30 -54 -31 -62 0 -9 -9 -29 -20 -46 -10 -16 -22 -37 -25 -45 -4 -8 -40 -84 -80 -168 -41 -84 -74 -155 -74 -157 0 -2 -19 -43 -41 -92 -23 -48 -54 -115 -69 -148 -15 -33 -67 -143 -115 -245 -85 -181 -114 -244 -160 -345 -13 -27 -41 -88 -63 -135 -22 -47 -67 -143 -100 -215 -33 -71 -117 -254 -187 -405 -70 -151 -161 -349 -201 -438 -41 -90 -110 -239 -153 -330 -104 -220 -141 -301 -141 -306 0 -5 -43 -97 -146 -315 -35 -73 -64 -136 -64 -138 0 -3 -25 -57 -55 -120 -30 -63 -55 -117 -55 -119 0 -4 -32 -72 -131 -282 -23 -48 -52 -109 -64 -137 -53 -115 -271 -586 -301 -653 -19 -39 -34 -78 -34 -85 0 -6 -7 -21 -15 -31 -19 -25 -19 -46 -2 -46 14 0 208 102 276 144 20 13 56 34 81 48 25 14 77 43 115 65 39 22 149 83 245 136 96 52 225 123 285 157 172 98 531 299 625 350 107 58 413 231 460 259 19 11 60 34 90 49 30 16 134 73 230 127 96 53 238 132 315 175 490 271 575 325 636 402 49 63 103 174 125 258 32 125 4 299 -69 423 -59 100 -158 178 -372 294 -60 33 -127 69 -147 81 -21 12 -68 38 -105 58 -37 20 -97 54 -133 74 -36 20 -101 56 -145 80 -119 65 -145 79 -320 175 -88 48 -179 98 -201 110 -88 47 -89 49 -77 102 12 51 47 167 82 268 24 71 54 164 135 423 49 158 75 240 116 367 23 72 45 148 50 170 17 79 29 118 39 128 6 6 11 28 11 48 0 21 5 41 10 44 6 3 10 25 10 49 0 23 3 46 7 50 10 10 31 96 23 96 -3 0 -14 -17 -23 -38z M610 6482 c-84 -6 -161 -26 -240 -64 -161 -77 -300 -254 -341 -433 -20 -88 -21 -4474 -1 -4550 61 -223 175 -373 357 -464 158 -79 306 -99 458 -62 48 12 102 31 120 41 36 22 62 25 73 9 3 -6 -8 -59 -25 -117 -57 -199 -123 -456 -156 -612 -19 -85 -37 -166 -41 -180 l-7 -25 22 22 c11 12 21 31 21 42 0 11 4 23 10 26 5 3 10 15 10 26 0 10 5 19 10 19 6 0 18 17 27 37 37 86 76 170 94 205 11 20 25 53 33 75 8 21 43 99 79 173 35 74 103 218 150 320 47 102 101 219 120 260 19 41 47 104 62 140 35 84 54 126 133 290 35 74 70 153 78 174 8 22 18 44 22 50 5 6 21 43 37 81 15 39 56 129 90 200 34 72 79 168 100 215 58 132 79 178 125 275 80 169 170 365 170 369 0 4 50 112 137 296 41 87 112 244 150 330 9 19 30 67 48 105 53 111 95 202 313 675 361 783 346 747 320 768 -7 5 -78 46 -158 89 -80 44 -161 89 -180 100 -19 11 -71 39 -115 63 -44 23 -98 53 -120 65 -208 113 -282 154 -355 195 -47 26 -110 61 -140 77 -30 16 -80 44 -110 61 -30 17 -86 48 -125 69 -181 99 -226 124 -368 202 -84 46 -183 100 -222 121 -38 21 -92 50 -120 65 -199 108 -278 145 -330 158 -62 16 -153 24 -215 19z";

export type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  /** Height in px. Width follows the artwork's proportions. */
  size?: number;
};

export default function BrandMark({ size = 20, style, ...rest }: BrandMarkProps) {
  return (
    <svg
      width={Math.round((size * W) / H)}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ color: "var(--accent)", ...style }}
      {...rest}
    >
      {/* potrace emits y-up coordinates at 10x, hence the flip and scale. */}
      <g transform={`translate(0,${H}) scale(0.1,-0.1)`}>
        <path d={PATH} />
      </g>
    </svg>
  );
}
