/**
 * File: PanelWorkspace.tsx
 * Path: src/renderer/src/modules/layout/components/PanelWorkspace.tsx
 * Description: The workspace body: the left group, the centre (Preview over Timeline) and the
 *   right group, each side resizable. What each panel shows comes from the panel registry.
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

  return (
    <div ref={host} className="flex min-h-0 min-w-0 flex-1 gap-0 p-2">
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
      <div
        id="ui-panels-centre"
        aria-label="Workspace"
        role="region"
        className="panel-centre flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {centrePanels.map((def, i) => {
          const fixed = def.id === FIXED_CENTRE_PANEL;
          return (
            <div key={def.id} className="contents">
              {fixed && i > 0 ? (
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
              ) : null}
              <section
                id={panelBodyDomId(def.id)}
                aria-label={def.title}
                className={`flex min-h-0 min-w-0 flex-col ${fixed ? "shrink-0" : "flex-1"}`}
                style={fixed ? { height: layout.sizes.timeline } : undefined}
              >
                {createElement(def.component)}
              </section>
            </div>
          );
        })}
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
  );
}
