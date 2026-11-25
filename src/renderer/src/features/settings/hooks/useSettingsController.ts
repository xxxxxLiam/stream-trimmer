/**
 * File: useSettingsController.ts
 * Path: src/renderer/src/features/settings/hooks/useSettingsController.ts
 * Description: The one hook SettingsDrawer calls. Holds which view is showing (top list, Campaigns,
 *   one campaign) and its Back target, joins the campaign list with the prefs, and
 *   closes on Escape. Opens on one campaign when the campaign menu asks for it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { DEFAULT_DAILY_QUOTA, campaignSummary, languagesLine } from "../utils/settingsPrefs";
import { useSettingsState } from "./useSettingsState";
import { editorStartCampaign } from "../utils/editorSetup";

export type SettingsView = { kind: "top" } | { kind: "campaign"; id: string } | { kind: "editor"; id: string } | { kind: "signin" };

/** `startAt` value that opens Settings on the sign-in page (the footer pill). */
export const START_AT_SIGNIN = "@signin";

export function parentOf(v: SettingsView): { label: string; view: SettingsView } | null {
  // The label is the campaign's own name, which only the caller knows; the empty label is replaced there.
  if (v.kind === "editor") return { label: "", view: { kind: "campaign", id: v.id } };
  if (v.kind === "campaign") return { label: "Settings", view: { kind: "top" } };
  if (v.kind === "signin") return { label: "Settings", view: { kind: "top" } };
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

  // True while the editor page was opened by picking an editor in the Clip menu: it then offers "Skip for now".
  const [fromPick, setFromPick] = useState(false);
  useEffect(() => {
    if (!open) return;
    const pickedFor = editorStartCampaign(startAt);
    setFromPick(pickedFor !== null);
    setView(
      startAt === START_AT_SIGNIN ? { kind: "signin" } : pickedFor ? { kind: "editor", id: pickedFor } : startAt ? { kind: "campaign", id: startAt } : { kind: "top" },
    );
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
  const gone = (view.kind === "campaign" || view.kind === "editor") && !campaigns.campaigns.some((c) => c.id === view.id);
  useEffect(() => {
    if (gone) setView({ kind: "top" });
  }, [gone]);

  const rows = useMemo(
    () =>
      campaigns.campaigns.map((c) => {
        const p = prefs.prefsFor(c.id);
        return { id: c.id, name: c.name, summary: campaignSummary(c.dailyQuota ?? DEFAULT_DAILY_QUOTA), languages: languagesLine(p) };
      }),
    [campaigns.campaigns, prefs],
  );

  const back = useCallback(() => {
    const p = parentOf(view);
    setFromPick(false);
    if (p) setView(p.view);
  }, [view]);

  return {
    view,
    fromPick,
    setView,
    back,
    parent: parentOf(view),
    rows,
    adding,
    setAdding,
    ...prefs,
    campaigns,
  };
}
