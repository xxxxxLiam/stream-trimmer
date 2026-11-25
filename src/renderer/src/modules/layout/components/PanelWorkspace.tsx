/**
 * File: PanelWorkspace.tsx
 * Path: src/renderer/src/modules/layout/components/PanelWorkspace.tsx
 * Description: The workspace body: the left group, the centre (Preview) and the right group in a
 *   row, each side resizable, with the Timeline full width underneath. What each panel shows comes from the panel registry.
 */
import { createElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import PanelGroup from "./PanelGroup";
import PanelResizeHandle from "./PanelResizeHandle";
import { usePanelLayoutState } from "../hooks/usePanelLayoutState";
import { DEFAULT_SIZES, SIZE_LIMITS, CENTRE_MIN_W } from "../utils/panelLayout";
import { getPanel } from "../utils/panelRegistry";
import { panelBodyDomId } from "./PanelTabStrip";
import "../utils/panelRegistrations";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The panel that takes a fixed height in the centre; every other centre panel fills the rest. */
const FIXED_CENTRE_PANEL = "timeline";

export default function PanelWorkspace() {
  const { layout, resize } = usePanelLayoutState();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useIsoLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { left, right, centre } = layout.groups;
  const containerWidth = width || Infinity;
  const sideMax = (key: "left" | "right") =>
    Math.max(SIZE_LIMITS[key].min, Math.min(SIZE_LIMITS[key].max, containerWidth - layout.sizes[key === "left" ? "right" : "left"] - CENTRE_MIN_W));

  const centrePanels = centre.tabs.flatMap((id) => getPanel(id) ?? []);
  // The timeline runs the full width under all three groups; the other centre panels share the
  // space between the side groups.
  const timeline = centrePanels.find((d) => d.id === FIXED_CENTRE_PANEL);
  const upper = centrePanels.filter((d) => d.id !== FIXED_CENTRE_PANEL);

  return (
    <div ref={host} id="ui-panels-centre" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 px-[8px] pt-[8px]">
        {left.tabs.length ? (
          <>
            <div id="ui-panels-left" className="flex min-h-0 shrink-0" style={{ width: layout.sizes.left } as CSSProperties}>
              <PanelGroup group="left" />
            </div>
            <PanelResizeHandle
              orientation="vertical"
              label="Resize left panels"
              value={layout.sizes.left}
              min={SIZE_LIMITS.left.min}
              max={sideMax("left")}
              grows="with-pointer"
              onChange={(px, persist) => resize("left", px, containerWidth, persist)}
              onReset={() => resize("left", DEFAULT_SIZES.left, containerWidth)}
            />
          </>
        ) : null}
        <div aria-label="Workspace" role="region" className="panel-centre flex min-h-0 min-w-0 flex-1 flex-col">
          {upper.map((def) => (
            <section
              key={def.id}
              id={panelBodyDomId(def.id)}
              aria-label={def.title}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {createElement(def.component)}
            </section>
          ))}
        </div>
        {right.tabs.length ? (
          <>
            <PanelResizeHandle
              orientation="vertical"
              label="Resize right panels"
              value={layout.sizes.right}
              min={SIZE_LIMITS.right.min}
              max={sideMax("right")}
              grows="against-pointer"
              onChange={(px, persist) => resize("right", px, containerWidth, persist)}
              onReset={() => resize("right", DEFAULT_SIZES.right, containerWidth)}
            />
            <div className="flex min-h-0 shrink-0" style={{ width: layout.sizes.right } as CSSProperties}>
              <PanelGroup group="right" />
            </div>
          </>
        ) : null}
      </div>
      {timeline ? (
        <>
          <PanelResizeHandle
            orientation="horizontal"
            label="Resize timeline"
            value={layout.sizes.timeline}
            min={SIZE_LIMITS.timeline.min}
            max={SIZE_LIMITS.timeline.max}
            grows="against-pointer"
            onChange={(px, persist) => resize("timeline", px, containerWidth, persist)}
            onReset={() => resize("timeline", DEFAULT_SIZES.timeline)}
          />
          <section
            id={panelBodyDomId(timeline.id)}
            aria-label={timeline.title}
            className="flex min-h-0 min-w-0 shrink-0 flex-col"
            style={{ height: layout.sizes.timeline }}
          >
            {createElement(timeline.component)}
          </section>
        </>
      ) : null}
    </div>
  );
}
