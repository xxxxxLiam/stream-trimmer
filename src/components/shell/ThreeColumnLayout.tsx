/**
 * File: ThreeColumnLayout.tsx
 * Path: src/components/shell/ThreeColumnLayout.tsx
 * Description: The workspace body (BUILD-SPEC section 3): transcript | centre | clips,
 *   flex-wrap so the columns stack at phone width. The help drawer is a SIBLING of
 *   the columns so it can stay open while you work.
 */
import type { ReactNode } from "react";

/** Keep in step with the @container rule in styles.css (a test pins them together). */
export const THREE_COLUMN_MIN_PX = 840;

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
  // The columns respond to the width of THEIR OWN area (a container query in styles.css),
  // not the window: the help drawer is a sibling that takes 400px, so the viewport is the
  // wrong thing to measure. At or above THREE_COLUMN_MIN_PX the three share one row and scroll
  // internally; below it they wrap and stack inside one scrolling area. The window opens at
  // 1100 and cannot go under 900, so the default must land on the three-column side.
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div role="region" tabIndex={0} aria-label="Workspace" className="cols-host min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="cols-row flex min-w-0 flex-wrap content-start gap-2 p-2">
          <section
            id="ui-col-transcript"
            aria-label="Transcript"
            className="cols-side cols-transcript surface-panel flex max-h-[75vh] min-h-[320px] min-w-0 flex-[1_1_280px] flex-col overflow-hidden"
          >
            {transcript}
          </section>
          <section
            id="ui-col-centre"
            aria-label="Mark a clip"
            className="cols-centre flex min-w-0 flex-[999_1_420px] flex-col gap-2 [&>*]:shrink-0"
          >
            {centre}
          </section>
          <section
            id="ui-col-clips"
            aria-label="Clips"
            className="cols-side cols-clips surface-panel flex max-h-[75vh] min-h-[240px] min-w-0 flex-[1_1_260px] flex-col overflow-hidden"
          >
            {clips}
          </section>
        </div>
      </div>
      {drawer}
    </div>
  );
}
