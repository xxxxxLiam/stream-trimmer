/**
 * File: PanelsMenu.tsx
 * Path: src/renderer/src/modules/layout/components/PanelsMenu.tsx
 * Description: The top bar's icon-only Panels menu: a tick per panel (click to close or bring
 *   back), then Reset layout and Save layout.
 */
import { Grid1x2 } from "react-bootstrap-icons";
import PopoverMenu, { type MenuItem } from "./PopoverMenu";
import { hasSavedPanelLayout, restoreSavedPanelLayout, usePanelLayoutState } from "../hooks/usePanelLayoutState";
import { isOpen } from "../utils/panelLayout";

export default function PanelsMenu({
  triggerClassName,
  extraItems = [],
}: {
  triggerClassName?: string;
  /** Rows after the layout ones, for overlays that are not panels (Copy blocks, Symbols). */
  extraItems?: MenuItem[];
}) {
  const { layout, panels, toggle, reset, save } = usePanelLayoutState();
  const items: MenuItem[] = [
    ...panels.map<MenuItem>((p) => ({
      key: p.id,
      label: p.title,
      checked: isOpen(layout, p.id),
      disabled: p.closable === false,
      onSelect: () => toggle(p.id),
    })),
    { kind: "separator", key: "sep" },
    { key: "reset", label: "Reset layout", onSelect: reset },
    { key: "save", label: "Save layout", onSelect: save },
    ...(extraItems.length ? [{ kind: "separator", key: "sep2" } as MenuItem, ...extraItems] : []),
    ...(hasSavedPanelLayout() ? [{ key: "restore", label: "Use my saved layout", onSelect: restoreSavedPanelLayout } as MenuItem] : []),
  ];
  return (
    <PopoverMenu id="ui-panels-menu" label="Panels" items={items} triggerClassName={triggerClassName} labelWhenOpen>
      <Grid1x2 size={16} />
    </PopoverMenu>
  );
}
