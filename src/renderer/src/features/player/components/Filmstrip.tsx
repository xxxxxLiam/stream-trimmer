/**
 * File: Filmstrip.tsx
 * Path: src/renderer/src/features/player/components/Filmstrip.tsx
 * Description: The Source lane's picture strip, cut from the storyboard sprite sheets with no video
 *   download. Without storyboards it is the plain striped lane.
 */
import type { StoryboardLevel } from "../../../../../common/types/storyboard";
import { frameAt, levelForHeight } from "../utils/filmstrip";
import { toT, type Axis } from "../utils/timelineAxis";

const PLAIN = "repeating-linear-gradient(90deg, var(--c-hover) 0 62px, var(--c-raised) 62px 64px)";

export default function Filmstrip({
  axis,
  levels,
  height,
}: {
  axis: Axis;
  levels: readonly StoryboardLevel[] | undefined;
  height: number;
}) {
  const level = levelForHeight(levels, height);
  return (
    <>
      {axis.pieces.map((p) => {
        if (p.folded) return null;
        const w = p.x1 - p.x0;
        if (!level) {
          return <div key={p.x0} className="absolute" style={{ left: p.x0, width: w, top: 6, bottom: 6, background: PLAIN }} />;
        }
        const scale = height / level.height;
        const tileW = Math.max(1, Math.round(level.width * scale));
        const count = Math.ceil(w / tileW);
        return (
          <div key={p.x0} className="absolute overflow-hidden" style={{ left: p.x0, width: w, top: 6, bottom: 6 }}>
            {Array.from({ length: count }, (_, i) => {
              const t = toT(axis, p.x0 + i * tileW + tileW / 2) ?? p.t0;
              const cell = frameAt(level, t);
              const sheet = level.sheets[cell.sheet];
              return (
                <span
                  key={i}
                  className="absolute inset-y-[0px] bg-hover"
                  style={{
                    left: i * tileW,
                    width: tileW - 1,
                    backgroundImage: sheet ? `url(${sheet.url})` : undefined,
                    backgroundSize: `${level.columns * level.width * scale}px ${level.rows * level.height * scale}px`,
                    backgroundPosition: `-${cell.col * level.width * scale}px -${cell.row * level.height * scale}px`,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
