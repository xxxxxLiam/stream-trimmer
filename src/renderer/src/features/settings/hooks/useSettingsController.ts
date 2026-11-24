/**
 * File: useSettingsController.ts
 * Path: src/renderer/src/features/settings/hooks/useSettingsController.ts
 * Description: The one hook SettingsDrawer calls. Holds which view is showing (top list, Campaigns,
 *   one campaign, Clips folder) and its Back target, joins the campaign list with the prefs, and
 *   closes on Escape. Opens on one campaign when the campaign menu asks for it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { campaignSummary, languagesLine } from "../utils/settingsPrefs";
import { useSettingsState } from "./useSettingsState";

export type SettingsView = { kind: "top" } | { kind: "campaigns" } | { kind: "campaign"; id: string } | { kind: "folder" };

export function parentOf(v: SettingsView): { label: string; view: SettingsView } | null {
  if (v.kind === "campaign") return { label: "Campaigns", view: { kind: "campaigns" } };
  if (v.kind === "campaigns" || v.kind === "folder") return { label: "Settings", view: { kind: "top" } };
  return null;
}

export function useSettingsController({
  open,
  onClose,
  startAt,
}: {
  open: boolean;
  onClose: () => void;
  /** Campaign to land on, from "<Campaign> settings" in the campaign menu. */
  startAt: string | null;
}) {
  const campaigns = useCampaign();
  const prefs = useSettingsState();
  const [view, setView] = useState<SettingsView>({ kind: "top" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) setView(startAt ? { kind: "campaign", id: startAt } : { kind: "top" });
  }, [open, startAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !adding) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, adding]);

  // A campaign that was deleted while its view is open sends you back to the list.
  const gone = view.kind === "campaign" && !campaigns.campaigns.some((c) => c.id === view.id);
  useEffect(() => {
    if (gone) setView({ kind: "campaigns" });
  }, [gone]);

  const rows = useMemo(
    () =>
      campaigns.campaigns.map((c) => {
        const p = prefs.prefsFor(c.id);
        return { id: c.id, name: c.name, summary: campaignSummary(p), languages: languagesLine(p) };
      }),
    [campaigns.campaigns, prefs],
  );

  const back = useCallback(() => {
    const p = parentOf(view);
    if (p) setView(p.view);
  }, [view]);

  return {
    view,
    setView,
    back,
    parent: parentOf(view),
    rows,
    campaignNames: campaigns.campaigns.map((c) => c.name).join(", "),
    clipsFolder: campaigns.defaultFolders.clipsDir,
    clipsFolderLabel: folderChipLabel(campaigns.defaultFolders.clipsDir),
    adding,
    setAdding,
    ...prefs,
    campaigns,
  };
}
