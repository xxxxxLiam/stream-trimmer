/**
 * File: importLayouts.ts
 * Path: src/renderer/src/features/settings/utils/importLayouts.ts
 * Description: The layout templates a campaign can choose for Final Cut (A to D): their names, one-line
 *   descriptions, and the small tree that previews each one with the campaign's real names. Pure.
 */
import { keywordText, type FcpLayout } from "../../../shared/utils/fcpxml";

export type LayoutOption = { id: FcpLayout; name: string; blurb: string };

export const FINAL_CUT_LAYOUTS: LayoutOption[] = [
  { id: "export", name: "One Export event", blurb: "One event, with a keyword collection for each source video." },
  { id: "video", name: "Event per video", blurb: "A new event for each source video." },
  { id: "day", name: "Event per day", blurb: "One event a day, with a collection for each source video." },
  { id: "flat", name: "One event, no folders", blurb: "Everything in one event, in a flat list." },
];

export type PreviewNames = {
  library: string;
  /** The campaign's Event field, or the campaign name until it is edited. */
  event: string;
  /** Source video titles, as many as the preview shows. */
  videos: string[];
  /** The first clip's name, for example "ACM-x1y2z3-01". */
  clip: string;
  /** Today's date as the day event reads, for example "25 Nov 2026". */
  day: string;
};

export type TreeLine = { depth: number; label: string; note: string };

/** The tree a layout makes, in Final Cut's words. Each video holds its project and its raw clip. */
export function layoutTree(id: FcpLayout, n: PreviewNames): TreeLine[] {
  const out: TreeLine[] = [{ depth: 0, label: n.library, note: "library" }];
  const leaves = (depth: number) => [
    { depth, label: n.clip, note: "project" },
    { depth, label: `${n.clip}.mp4`, note: "raw clip" },
  ];
  const videos = n.videos.length > 0 ? n.videos : ["Your first video"];
  if (id === "export") {
    out.push({ depth: 1, label: n.event || "Export", note: "event" });
    for (const v of videos) out.push({ depth: 2, label: keywordText(v), note: "keyword collection" }, ...leaves(3));
  } else if (id === "video") {
    for (const v of videos) out.push({ depth: 1, label: v, note: "event" }, ...leaves(2));
  } else if (id === "day") {
    out.push({ depth: 1, label: n.day, note: "event" });
    for (const v of videos) out.push({ depth: 2, label: keywordText(v), note: "keyword collection" }, ...leaves(3));
  } else {
    out.push({ depth: 1, label: n.event || "Export", note: "event" }, ...leaves(2));
  }
  return out;
}

export const layoutName = (id: FcpLayout): string => FINAL_CUT_LAYOUTS.find((l) => l.id === id)?.name ?? "";
