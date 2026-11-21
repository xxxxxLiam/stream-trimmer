/**
 * File: ThreeColumnLayout.tsx
 * Path: src/components/shell/ThreeColumnLayout.tsx
 * Description: The workspace body (BUILD-SPEC section 3): transcript | centre | clips,
 *   flex-wrap so the columns stack at phone width. The help drawer is a SIBLING of
 *   the columns so it can stay open while you work.
 */
import type { ReactNode } from "react";

export type ThreeColumnLayoutProps = {
  /** FIND. Left column. */
  transcript: ReactNode;
  /** MARK. Centre column (video, timeline, mark bar). */
  centre: ReactNode;
  /** COLLECT. Right column. */
  clips: ReactNode;
  /** Right-side drawer. Rendered as a flex sibling of the columns. */
  drawer?: ReactNode;
};

export default function ThreeColumnLayout({
  transcript,
  centre,
  clips,
  drawer,
}: ThreeColumnLayoutProps) {
  // 520 (centre) + 320 + 280 + 2 gaps + padding. At or above this width the three
  // columns share one row and scroll internally; below it they wrap and stack.
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-w-0 flex-wrap content-start gap-2 p-2 min-[1160px]:h-full min-[1160px]:flex-nowrap">
          <section
            id="ui-col-transcript"
            aria-label="Transcript"
            className="surface-panel flex max-h-[75vh] min-h-[320px] min-w-0 flex-[1_1_320px] flex-col overflow-hidden min-[1160px]:max-h-none min-[1160px]:max-w-[400px]"
          >
            {transcript}
          </section>
          <section
            id="ui-col-centre"
            aria-label="Mark a clip"
            className="flex min-w-0 flex-[999_1_520px] flex-col gap-2 min-[1160px]:min-h-0 min-[1160px]:overflow-y-auto"
          >
            {centre}
          </section>
          <section
            id="ui-col-clips"
            aria-label="Clips"
            className="surface-panel flex max-h-[75vh] min-h-[240px] min-w-0 flex-[1_1_280px] flex-col overflow-hidden min-[1160px]:max-h-none min-[1160px]:max-w-[360px]"
          >
            {clips}
          </section>
        </div>
      </div>
      {drawer}
    </div>
  );
}
