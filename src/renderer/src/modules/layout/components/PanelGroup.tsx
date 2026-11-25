/**
 * File: PanelGroup.tsx
 * Path: src/renderer/src/modules/layout/components/PanelGroup.tsx
 * Description: One tabbed group (left or right): the tab strip over the active panel's body.
 */
import { createElement } from "react";
import PanelTabStrip, { panelBodyDomId, tabDomId } from "./PanelTabStrip";
import { usePanelLayoutState } from "../hooks/usePanelLayoutState";
import type { PanelGroupId } from "../utils/panelRegistry";
import { closedPanels } from "../utils/panelLayout";
import { getPanel } from "../utils/panelRegistry";
import type { MenuItem } from "./PopoverMenu";

const NAMES: Record<PanelGroupId, string> = { left: "Left panels", centre: "Centre panels", right: "Right panels" };

export default function PanelGroup({ group }: { group: "left" | "right" }) {
  const { layout, panels, activate, close, open, move, moveToGroup, reset, save } = usePanelLayoutState();
  const state = layout.groups[group];
  const other = group === "left" ? "right" : "left";
  const tabs = state.tabs.flatMap((id) => getPanel(id) ?? []);
  const activeDef = state.active ? getPanel(state.active) : undefined;
  const menuItems: MenuItem[] = [
    ...(activeDef && activeDef.closable !== false
      ? [{ key: "close", label: `Close ${activeDef.title}`, onSelect: () => close(activeDef.id) } as MenuItem]
      : []),
    ...(activeDef && activeDef.group !== "centre"
      ? [
          {
            key: "move-group",
            label: `Move ${activeDef.title} to ${NAMES[other]}`,
            onSelect: () => moveToGroup(activeDef.id, other),
          } as MenuItem,
        ]
      : []),
    { kind: "separator", key: "sep" },
    { key: "reset", label: "Reset layout", onSelect: reset },
    { key: "save", label: "Save layout", onSelect: save },
  ];

  return (
    <section aria-label={NAMES[group]} className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PanelTabStrip
        label={NAMES[group]}
        tabs={tabs}
        active={state.active}
        onActivate={activate}
        onClose={close}
        onMove={move}
        addable={closedPanels(layout, panels)}
        onAdd={open}
        menuItems={menuItems}
        onDropPanel={(id, index) => moveToGroup(id, group, index)}
      />
      {activeDef ? (
        <div
          role="tabpanel"
          id={panelBodyDomId(activeDef.id)}
          aria-labelledby={tabDomId(activeDef.id)}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {createElement(activeDef.component)}
        </div>
      ) : (
        <p className="m-0 p-[16px] text-body text-fg-dim">No panels open. Use + to add one.</p>
      )}
    </section>
  );
}
