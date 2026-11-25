/**
 * File: useFinalCutLayout.ts
 * Path: src/renderer/src/features/settings/hooks/useFinalCutLayout.ts
 * Description: The "Layout" row's state and actions for one campaign: the chosen template (A by default), the
 *   open list, and the preview tree built from the campaign's real names. The choice lives in the campaign's
 *   Final Cut settings, where the generator reads it. Picking one remembers it for the next campaign.
 */
import { useState } from "react";
import type { Campaign } from "../../../shared/utils/campaigns";
import { clipIdExample } from "../../../shared/utils/campaigns";
import { layoutsFor } from "../../../shared/utils/editorLayouts";
import { DEFAULT_EXPORT_EVENT, type FcpLayout } from "../../../shared/utils/fcpxml";
import { rememberLastLayout } from "../../../shared/utils/lastLayout";
import type { FinalCutLayoutProps } from "../components/FinalCutLayout";
import { FINAL_CUT_LAYOUTS, layoutTree } from "../utils/importLayouts";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function useFinalCutLayout(
  campaign: Campaign | undefined,
  state: { layout: FcpLayout; onLayout: (id: FcpLayout) => void },
  names: { library: string; event: string; videoTitle?: string },
): FinalCutLayoutProps | undefined {
  const [open, setOpen] = useState(false);
  // Only the layouts this editor can honour; none means no Layout row.
  const honoured = layoutsFor("finalcut");
  if (!campaign || honoured.length === 0) return undefined;
  return {
    options: FINAL_CUT_LAYOUTS.filter((o) => honoured.includes(o.id)),
    current: state.layout,
    open,
    onToggleOpen: () => setOpen((v) => !v),
    onPick: (id) => {
      rememberLastLayout(id);
      state.onLayout(id);
      setOpen(false);
    },
    tree: layoutTree(state.layout, {
      library: names.library || campaign.name,
      event: names.event || DEFAULT_EXPORT_EVENT,
      videos: [names.videoTitle || "Your first video"],
      clip: clipIdExample(campaign.clipIdPattern, campaign.prefix),
      day: DAY.format(new Date()),
    }),
  };
}
