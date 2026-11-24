/**
 * File: tipRegistry.ts
 * Path: src/renderer/src/features/tips/utils/tipRegistry.ts
 * Description: Every first-use tip: id, version, the panel's name (what Help lists), and up to three
 *   steps, each pointing at a control by selector. Raising a version shows that tip once more after a
 *   redesign. A tip is written only for a panel whose labels are final.
 */
export type TipStep = { target: string; text: string };
export type Tip = { id: string; version: number; name: string; steps: TipStep[] };

export const MAX_TIP_STEPS = 3;

export const TIPS: Tip[] = [
  {
    id: "marking",
    version: 1,
    name: "Marking a clip",
    steps: [
      { target: "#ui-mark-in", text: "Press I where the clip should start." },
      { target: "#ui-mark-out", text: "Press O where it should end." },
      { target: "#ui-cut", text: "Cut saves the clip as its own file." },
    ],
  },
  {
    id: "export",
    version: 1,
    name: "Export",
    steps: [{ target: "#help-anchor-clips-tabs", text: "Moments you keep for later wait here. Cut one whenever you are ready." }],
  },
  {
    id: "transcript",
    version: 1,
    name: "Transcript",
    steps: [{ target: "#ui-transcript-search", text: "Search what was said to find a moment faster." }],
  },
];
