/**
 * File: useImportController.ts
 * Path: src/renderer/src/features/import/hooks/useImportController.ts
 * Description: The only hook ImportDrawer calls. Reads the pasted rows against the open video, keeps
 *   which flagged rows were swapped or skipped, and on "Bank" files each group under its campaign
 *   (a campaign the paste names that does not exist yet is created first) and closes.
 */
import { useMemo, useState } from "react";
import { usePanelLayoutState } from "../../../modules/layout/hooks/usePanelLayoutState";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { bankStore, clipsFor } from "../../../shared/utils/bank";
import type { ParsedClip } from "../../../shared/utils/bankImport";
import { checkImportNames, parseMoments, planBank, resolveRows, type MomentRow } from "../utils/momentRows";

export function toParsed(r: MomentRow): ParsedClip {
  return {
    line: Number(r.key) || 1,
    id: null,
    label: r.name,
    segments: [{ start: r.start, end: r.end }, ...(r.more ?? [])],
    ...(r.category ? { category: r.category } : {}),
    ...(r.tier ? { tier: r.tier } : {}),
    ...(typeof r.rating === "number" ? { rating: r.rating } : {}),
    ...(typeof r.ranPastEnd === "number" ? { ranPastEnd: r.ranPastEnd } : {}),
  };
}

export function useImportController(text: string, onClose: () => void) {
  const { videoId, duration } = useClipperContext();
  const { campaigns, active, create, setActiveId } = useCampaign();
  const { open: openPanel } = usePanelLayoutState();
  const [swapped, setSwapped] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [renamed, setRenamed] = useState<ReadonlyMap<string, string>>(new Map());

  const rows = useMemo(() => {
    // Names already in the active campaign's bank, for this video and every other.
    const data = bankStore.get();
    const existing = active ? Object.keys(data[active.id] ?? {}).flatMap((v) => clipsFor(data, active.id, v).map((c) => ({ id: c.id, name: c.label }))) : [];
    return checkImportNames(parseMoments(text, { openVideoId: videoId ?? null, openDuration: duration || undefined }), existing, skipped, renamed);
  }, [text, videoId, duration, active, skipped, renamed]);
  const r = useMemo(() => resolveRows(rows, swapped, skipped), [rows, swapped, skipped]);

  // Same campaign whatever the case, accents or spacing ("Tyler  Oliveira" = "tyler oliveira").
  const key = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const known = (name: string) => campaigns.find((c) => key(c.name) === key(name));
  const newCampaigns = r.campaigns.filter((n) => !known(n));
  const count = r.good.length;
  const canBank = count > 0 && (Boolean(active) || r.good.every((m) => m.campaign));

  const bank = () => {
    if (!canBank) return;
    const made = new Map<string, string>();
    const keepActive = active?.id ?? null;
    for (const name of newCampaigns) made.set(key(name), create({ name }).id);
    if (made.size) setActiveId(keepActive);
    const landed: string[] = [];
    for (const b of planBank(r.good)) {
      const cid = b.campaignName ? (known(b.campaignName)?.id ?? made.get(key(b.campaignName))) : keepActive;
      if (!cid) continue;
      bankStore.importClips(cid, b.videoId, b.rows.map(toParsed));
      landed.push(cid);
    }
    // Show where they went: if none landed in the open campaign, move to the one that got them, and bring Export forward.
    if (landed.length && !(keepActive && landed.includes(keepActive))) setActiveId(landed[0]);
    openPanel("export");
    onClose();
  };

  const flip = (set: ReadonlySet<string>, k: string) => new Set([...set, k]);
  return {
    ...r,
    count,
    canBank,
    newCampaigns,
    campaignName: active?.name ?? "",
    openVideoId: videoId ?? null,
    swap: (k: string) => setSwapped((s) => flip(s, k)),
    skip: (k: string) => setSkipped((s) => flip(s, k)),
    rename: (k: string, name: string) => setRenamed((m) => new Map(m).set(k, name)),
    bank,
  };
}
