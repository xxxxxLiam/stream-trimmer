/**
 * File: useFinalCutLayout.ts
 * Path: src/renderer/src/features/settings/hooks/useFinalCutLayout.ts
 * Description: The "Layout" row's state and actions for one campaign: the chosen template (A by default), the
 *   open list, and the preview tree built from the campaign's real names. Picking one remembers it so a new
 *   campaign starts with it.
 */
import { useState } from "react";
import { DEFAULT_IMPORT_LAYOUT } from "../../../../../common/types/importLayout";
import type { Campaign } from "../../../shared/utils/campaigns";
import { clipIdExample } from "../../../shared/utils/campaigns";
import { rememberLastLayout } from "../../../shared/utils/lastLayout";
import type { FinalCutLayoutProps } from "../components/FinalCutLayout";
import { FINAL_CUT_LAYOUTS, layoutTree } from "../utils/importLayouts";

type Store = { update: (id: string, patch: Partial<Omit<Campaign, "id" | "usedRanges">>) => void };

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function useFinalCutLayout(
  campaign: Campaign | undefined,
  store: Store,
  names: { library: string; event: string; videoTitle?: string },
): FinalCutLayoutProps | undefined {
  const [open, setOpen] = useState(false);
  if (!campaign) return undefined;
  const current = campaign.fcpLayout ?? DEFAULT_IMPORT_LAYOUT;
  return {
    options: FINAL_CUT_LAYOUTS,
    current,
    open,
    onToggleOpen: () => setOpen((v) => !v),
    onPick: (id) => {
      rememberLastLayout(id);
      store.update(campaign.id, { fcpLayout: id });
      setOpen(false);
    },
    tree: layoutTree(current, {
      library: names.library || campaign.name,
      event: names.event || "Export",
      videos: [names.videoTitle || "Your first video"],
      clip: clipIdExample(campaign.clipIdPattern, campaign.prefix),
      day: DAY.format(new Date()),
    }),
  };
}
