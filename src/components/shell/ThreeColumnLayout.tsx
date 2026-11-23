/**
 * File: ThreeColumnLayout.tsx
 * Path: src/components/shell/ThreeColumnLayout.tsx
 * Description: The workspace body (BUILD-SPEC section 3): transcript | centre | clips,
 *   flex-wrap so the columns stack at phone width. The help drawer is a SIBLING of
 *   the columns so it can stay open while you work. The two side columns can be resized
 *   with drag handles (keyboard too); the widths persist in "clipper.columnWidths".
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { readSetting, writeSetting } from "../../lib/persist";
import ColumnHandle from "./ColumnHandle";
import ColumnToggle, { toggleId } from "./ColumnToggle";
import {
  COLUMN_WIDTHS_KEY,
  applyMove,
  boundsFor,
  otherOccupied,
  toggleCollapsed,
  dragWidth,
  parseStored,
  resolveWidths,
  serializeStored,
  type ColumnKind,
  type StoredWidths,
} from "./columnSizes";

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

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function ThreeColumnLayout({
  transcript,
  centre,
  clips,
  drawer,
}: ThreeColumnLayoutProps) {
  // The columns respond to the width of THEIR OWN area (a container query in styles.css),
  // not the window. At or above THREE_COLUMN_MIN_PX the three share one row and scroll
  // internally; below it they wrap and stack inside one scrolling area, mark column first.
  // The window opens at 1280 and cannot go under 1160.
  //
  // `relative` anchors the help drawer, which is absolutely positioned over this area
  // rather than being a flex sibling. As a sibling it took 400px out of the row and
  // reflowed all three columns on open, which is not what a side panel should do.
  //
  // Resizing: dragged widths reach the columns as CSS variables (--col-t, --col-c) that
  // styles.css only reads INSIDE the wide container query, so stacked columns can never be
  // left with a stuck width. The handles are only rendered while the row is wide.
  const hostRef = useRef<HTMLDivElement>(null);
  const [containerPx, setContainerPx] = useState(0);
  const [stored, setStored] = useState<StoredWidths>(() => parseStored(readSetting<unknown>(COLUMN_WIDTHS_KEY, null)));
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const dragStart = useRef(0);
  /** After a toggle the clicked button is replaced by its other form; focus follows it. */
  const refocus = useRef<ColumnKind | null>(null);

  useIsoLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setContainerPx(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wide = containerPx >= THREE_COLUMN_MIN_PX;
  const widths = resolveWidths(stored, containerPx || THREE_COLUMN_MIN_PX);
  const customised = stored.transcript !== null || stored.clips !== null;
  // Collapsing only exists in the wide row. Stacked, every panel shows, so nothing a
  // collapsed panel holds can be stranded below the fold.
  const hide = { transcript: wide && widths.collapsed.transcript, clips: wide && widths.collapsed.clips };

  useEffect(() => {
    const k = refocus.current;
    if (!k) return;
    refocus.current = null;
    document.getElementById(toggleId(k))?.focus();
  });

  const commit = useCallback((next: StoredWidths, persist: boolean) => {
    storedRef.current = next;
    setStored(next);
    if (persist) writeSetting(COLUMN_WIDTHS_KEY, serializeStored(next));
  }, []);

  /** Set one column from a width; the other keeps what it is showing now. */
  const setWidth = (kind: ColumnKind, px: number, persist: boolean) => {
    commit({ transcript: widths.transcript, clips: widths.clips, collapsed: widths.collapsed, [kind]: px }, persist);
  };
  const toggle = (kind: ColumnKind) => {
    refocus.current = kind;
    commit(toggleCollapsed(storedRef.current, kind), true);
  };
  const reset = (kind: ColumnKind) => commit({ ...storedRef.current, [kind]: null }, true);

  const handleFor = (kind: ColumnKind) => {
    const { min, max } = boundsFor(kind, containerPx, otherOccupied(kind, widths));
    return (
      <>
      <ColumnToggle kind={kind} collapsed={false} onToggle={() => toggle(kind)} />
      <ColumnHandle
        kind={kind}
        value={widths[kind]}
        min={min}
        max={max}
        onKeyMove={(move, large) => setWidth(kind, applyMove(kind, move, widths, containerPx, large), true)}
        onDragStart={() => {
          dragStart.current = widths[kind];
        }}
        onDragTo={(dx) => setWidth(kind, dragWidth(kind, dragStart.current, dx, widths, containerPx), false)}
        onDragEnd={() => writeSetting(COLUMN_WIDTHS_KEY, serializeStored(storedRef.current))}
        onReset={() => reset(kind)}
      />
      </>
    );
  };

  const rowVars = {
    "--col-t": `${widths.transcript}px`,
    "--col-c": `${widths.clips}px`,
  } as CSSProperties;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
      <div ref={hostRef} role="region" tabIndex={0} aria-label="Workspace" className={`cols-host min-h-0 min-w-0 flex-1 ${wide ? "overflow-clip" : "overflow-y-auto"}`}>
        <div
          className="cols-row relative flex min-w-0 flex-wrap content-start gap-2 p-2"
          style={wide ? rowVars : undefined}
          data-sized={wide && customised ? "" : undefined}
          data-hide-transcript={hide.transcript ? "" : undefined}
          data-hide-clips={hide.clips ? "" : undefined}
        >
          <section
            id="ui-col-transcript"
            aria-label="Transcript"
            className="cols-side cols-transcript surface-panel flex max-h-[75vh] min-h-[320px] min-w-0 flex-[1_1_280px] flex-col overflow-hidden"
          >
            {transcript}
          </section>
          {hide.transcript ? <ColumnToggle kind="transcript" collapsed onToggle={() => toggle("transcript")} /> : null}
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
          {hide.clips ? <ColumnToggle kind="clips" collapsed onToggle={() => toggle("clips")} /> : null}
          {wide && !hide.transcript ? handleFor("transcript") : null}
          {wide && !hide.clips ? handleFor("clips") : null}
        </div>
      </div>
      {drawer}
    </div>
  );
}
