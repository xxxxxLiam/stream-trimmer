/**
 * File: PanelGroup.tsx
 * Path: src/renderer/src/modules/layout/components/PanelGroup.tsx
 * Description: One tabbed group (left or right): the tab strip over the active panel's body.
 */
import { enterSelectMoments } from "../../../shared/utils/selectMomentsStore";
import { createElement, useEffect, useState } from "react";
import PanelTabStrip, { panelBodyDomId, tabDomId } from "./PanelTabStrip";
import { usePanelHostOptional } from "../hooks/PanelHostContext";
import { usePanelLayoutState } from "../hooks/usePanelLayoutState";
import type { PanelGroupId } from "../utils/panelRegistry";
import { closedPanels } from "../utils/panelLayout";
import { getPanel } from "../utils/panelRegistry";
import type { MenuItem } from "./PopoverMenu";
import { useCopyListFor } from "../hooks/copyListStore";
import { IconCopy, IconSaveFile } from "../../../shared/components/rowIcons";
import { clipCountText as countText } from "../../../shared/utils/clipListText";

const NAMES: Record<PanelGroupId, string> = { left: "Left panels", centre: "Centre panels", right: "Right panels" };

export default function PanelGroup({ group }: { group: "left" | "right" }) {
  const { layout, panels, activate, close, open, move, moveToGroup, reset, save } = usePanelLayoutState();
  const state = layout.groups[group];
  const other = group === "left" ? "right" : "left";
  const tabs = state.tabs.flatMap((id) => getPanel(id) ?? []);
  const activeDef = state.active ? getPanel(state.active) : undefined;
  const host = usePanelHostOptional();
  // Board 04.2: with Export in front, + adds to Export. The panel menu (···) still opens and closes panels.
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const addMenu =
    activeDef?.id === "export" && host
      ? {
          label: "Add to Export",
          width: 212,
          items: [
            { key: "import", label: "Import moments", detail: mac ? "⌘V" : "Ctrl V", onSelect: () => host.openImport() },
            { key: "moment", label: "Add a moment", onSelect: () => host.addMoment() },
          ] as MenuItem[],
        }
      : undefined;
  // Export and History start their menu with the list as text: Copy as text (the default) and Save as .txt….
  const list = useCopyListFor(activeDef?.id);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const t = window.setTimeout(() => setSaid(null), 3000);
    return () => window.clearTimeout(t);
  }, [said]);
  const copyList = async () => {
    if (!list || list.count === 0) return;
    try {
      await navigator.clipboard.writeText(await list.text());
      setSaid(`✓ Copied ${countText(list.count)}`);
    } catch {
      setSaid("Could not copy. Try Save as .txt instead.");
    }
  };
  const saveList = async () => {
    if (!list || list.count === 0) return;
    const text = await list.text();
    const name = list.fileName();
    const save = window.electronAPI?.saveTextFile;
    if (save) {
      const res = await save({ name, text });
      if (res.ok) setSaid(`✓ Saved ${countText(list.count)}`);
      else if (!res.cancelled) setSaid(res.error ?? "Could not save the file.");
      return;
    }
    // The browser build has no save dialog: hand the file to the browser's download.
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setSaid(`✓ Saved ${countText(list.count)}`);
  };
  const listItems: MenuItem[] = list
    ? [
        { key: "copy-list", label: "Copy as text", icon: <IconCopy />, detail: list.count > 0 ? countText(list.count) : undefined, disabled: list.count === 0, onSelect: () => void copyList() },
        ...(activeDef?.id === "export" ? [{ key: "select-moments", label: "Select moments", disabled: list.count === 0, onSelect: enterSelectMoments } as MenuItem] : []),
        { key: "save-list", label: "Save as .txt…", icon: <IconSaveFile />, disabled: list.count === 0, onSelect: () => void saveList() },
        ...(list.count === 0 ? [{ kind: "note", key: "list-empty", label: list.emptyNote } as MenuItem] : []),
        { kind: "separator", key: "sep-list" } as MenuItem,
      ]
    : [];
  const menuItems: MenuItem[] = [
    ...listItems,
    ...(activeDef && activeDef.closable !== false
      ? [{ key: "close", label: `Close ${activeDef.title}`, onSelect: () => close(activeDef.id) } as MenuItem]
      : []),
    ...(activeDef && activeDef.group !== "centre"
      ? [
          {
            key: "move-group",
            label: `Move ${activeDef.title} to the ${other}`,
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
        addMenu={addMenu}
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
          {said ? (
            <div
              role="status"
              className={`mx-[10px] mb-[10px] flex h-[44px] flex-none items-center rounded-control border border-hairline bg-raised px-[12px] text-body leading-[normal] ${said.startsWith("✓") ? "" : "text-error"}`}
            >
              {said.startsWith("✓") ? (
                <>
                  <span aria-hidden className="mr-[8px] text-ice">✓</span>
                  {said.slice(2)}
                </>
              ) : (
                said
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="m-0 p-[16px] text-body text-fg-dim">No panels open. Use + to add one.</p>
      )}
    </section>
  );
}
