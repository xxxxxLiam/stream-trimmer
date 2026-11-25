import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCopyList, registerCopyList } from "./copyListStore";

test("Copy list: a panel's list is what the menu reads, and it is gone when the panel is", () => {
  registerCopyList("export", { count: 2, emptyNote: "n", text: () => "T", fileName: () => "f.txt" });
  assert.equal(getCopyList("export")?.count, 2);
  assert.equal(getCopyList("export")?.text(), "T");
  registerCopyList("export", null);
  assert.equal(getCopyList("export"), undefined);
});

test("Copy list: Export and History menus lead with Copy as text and Save as .txt…, disabled with one dim line when empty, and confirm for 3 s", () => {
  const g = readFileSync("src/renderer/src/modules/layout/components/PanelGroup.tsx", "utf8");
  assert.match(g, /label: "Copy as text"[^\n]*disabled: list\.count === 0/);
  assert.match(g, /label: "Save as \.txt…"[^\n]*disabled: list\.count === 0/);
  assert.match(g, /\.\.\.\(list\.count === 0 \? \[\{ kind: "note", key: "list-empty", label: list\.emptyNote \}/);
  assert.match(g, /\.\.\.listItems,/);
  assert.match(g, /setTimeout\(\(\) => setSaid\(null\), 3000\)/);
  assert.match(g, /`✓ Copied \$\{countText\(list\.count\)\}`/);
  const ex = readFileSync("src/renderer/src/features/clips/hooks/useExportController.ts", "utf8");
  assert.match(ex, /useCopyListSource\("export"/);
  assert.match(ex, /Nothing to copy yet\. Clips you add show up here\./);
  const hi = readFileSync("src/renderer/src/features/downloads/hooks/useHistoryController.ts", "utf8");
  assert.match(hi, /useCopyListSource\("history"/);
  assert.match(hi, /historyGroups\(queries\.groups\.flatMap/);
  assert.match(hi, /Nothing to copy yet\. Exported clips show up here\./);
});

test("Copy list: only the workspace tab in front owns a panel's list (hidden tabs render their own panels too)", () => {
  const s = readFileSync("src/renderer/src/modules/layout/hooks/copyListStore.ts", "utf8");
  assert.match(s, /const active = useIsTabActive\(\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*if \(!active\) return;/);
});
