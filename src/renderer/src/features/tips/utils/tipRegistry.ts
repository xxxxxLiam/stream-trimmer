/**
 * File: tipRegistry.ts
 * Path: src/renderer/src/features/tips/utils/tipRegistry.ts
 * Description: Every first-use tip: id, version, the panel's name (what Help lists), and up to three
 *   steps, each pointing at a control by selector. Raising a version shows that tip once more after a
 *   redesign. A tip is written only for a panel whose labels are final.
 */
/** `advanceOn`: the real action that finishes a step, so the person learns by doing instead of pressing Next. */
export type TipStep = {
  target: string;
  text: string;
  advanceOn?: { keys?: string[]; click?: string };
};
export type Tip = {
  id: string;
  version: number;
  name: string;
  steps: TipStep[];
};

export const MAX_TIP_STEPS = 3;

export const TIPS: Tip[] = [
  {
    id: "marking",
    version: 1,
    name: "Marking a clip",
    steps: [
      {
        target: "#ui-mark-in",
        text: "Press I where the clip should start.",
        advanceOn: { keys: ["i"], click: "#ui-mark-in" },
      },
      {
        target: "#ui-mark-out",
        text: "Press O where it should end.",
        advanceOn: { keys: ["o"], click: "#ui-mark-out" },
      },
      {
        target: "#ui-cut",
        text: "Clip saves it as its own file.",
        advanceOn: { keys: ["Mod+Enter"], click: "#ui-cut" },
      },
    ],
  },
  {
    id: "export",
    version: 1,
    name: "Export",
    steps: [
      {
        target: "#help-anchor-clips-tabs",
        text: "Moments you keep for later wait here. Clip one whenever you are ready.",
      },
    ],
  },
  {
    id: "transcript",
    version: 1,
    name: "Transcript",
    steps: [
      {
        target: "#ui-transcript-search",
        text: "Search what was said to find a moment faster.",
      },
    ],
  },
];
