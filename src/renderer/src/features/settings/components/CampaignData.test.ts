/**
 * File: CampaignData.test.ts
 * Description: Audit A-3 and A-7: the Clips folder is the parent of every campaign's folder (Change moves the parent, a
 *   campaign's own folder is its own), and the Delete campaign click disarms itself.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("A-3: a new campaign gets no copy of the active one's folder, and the folders follow the parent", () => {
  const ctx = src("../../campaigns/hooks/CampaignContext.tsx");
  assert.match(ctx, /const clipsDir = input\.clipsDir \?\? "";/);
  assert.match(ctx, /campaignClipsDir\(active, defaults\.clipsDir\)/);
  assert.match(ctx, /campaignClipsDir\(active, defaultFolders\.clipsDir\)/);
});

test("A-3: Settings > Clips folder > Change moves the parent, not one campaign", () => {
  assert.match(src("./SettingsDrawer.tsx"), /pickParentClipsDir\(\)/);
  const ctx = src("../../campaigns/hooks/CampaignContext.tsx");
  const setter = ctx.slice(ctx.indexOf("const setClipsDir = useCallback"), ctx.indexOf("const setDataDir = useCallback"));
  assert.doesNotMatch(setter, /saveDefaults/, "a campaign's own folder never rewrites the parent");
});

test("A-7: the armed Delete times out and disarms on leaving the view or closing", () => {
  const d = src("./SettingsDrawer.tsx");
  assert.match(d, /DELETE_ARM_MS = 5000/);
  assert.match(d, /window\.setTimeout\(\(\) => setConfirming\(null\), DELETE_ARM_MS\)/);
  assert.match(d, /useEffect\(\(\) => setConfirming\(null\), \[viewKey, open\]\)/);
  assert.match(src("./SettingsCampaign.tsx"), /Click again to delete \$\{p\.name\}`/);
});
