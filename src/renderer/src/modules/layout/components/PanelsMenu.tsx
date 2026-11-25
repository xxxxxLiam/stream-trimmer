/**
 * File: PanelsMenu.tsx
 * Path: src/renderer/src/modules/layout/components/PanelsMenu.tsx
 * Description: The top bar's Panels menu (board 03.2.15): a tick per side panel, the Transcript
 *   lane under Timeline, then Save layout and Reset layout. Copy blocks and Symbols are reached
 *   by their keys, not from here.
 */
import { IconPanels } from "./BarIcons";
import PopoverMenu, { type MenuItem } from "./PopoverMenu";
import { hasSavedPanelLayout, restoreSavedPanelLayout, usePanelLayoutState } from "../hooks/usePanelLayoutState";
import { isOpen } from "../utils/panelLayout";
import { setTranscriptLaneShown, useTranscriptLane } from "../../../features/player/hooks/useTranscriptLane";

export default function PanelsMenu({ triggerClassName, extraItems = [] }: { triggerClassName?: string; extraItems?: MenuItem[] }) {
  const { layout, panels, toggle, reset, save } = usePanelLayoutState();
  const laneShown = useTranscriptLane();
  const items: MenuItem[] = [
    { kind: "heading", key: "h-panels", label: "Panels" },
    // The preview and the timeline are fixed in the centre; only the side panels come and go.
    ...panels
      .filter((p) => p.group !== "centre")
      .map<MenuItem>((p) => ({
        key: p.id,
        label: p.title,
        checked: isOpen(layout, p.id),
        disabled: p.closable === false,
        keepOpen: true,
        onSelect: () => toggle(p.id),
      })),
    { kind: "separator", key: "sep-timeline" },
    { kind: "heading", key: "h-timeline", label: "Timeline" },
    { key: "lane", label: "Transcript lane", checked: laneShown, keepOpen: true, onSelect: () => setTranscriptLaneShown(!laneShown) },
    { kind: "separator", key: "sep-layout" },
    { key: "save", label: "Save layout", onSelect: save },
    { key: "reset", label: "Reset layout", onSelect: reset },
    ...(extraItems.length ? [{ kind: "separator", key: "sep-extra" } as MenuItem, ...extraItems] : []),
    ...(hasSavedPanelLayout() ? [{ key: "restore", label: "Use my saved layout", onSelect: restoreSavedPanelLayout } as MenuItem] : []),
  ];
  return (
    <PopoverMenu id="ui-panels-menu" label="Panels" items={items} triggerClassName={triggerClassName} menuWidth={260} labelWhenOpen>
      <IconPanels />
    </PopoverMenu>
  );
}
