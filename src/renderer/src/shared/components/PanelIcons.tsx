/**
 * File: PanelIcons.tsx
 * Path: src/renderer/src/shared/components/PanelIcons.tsx
 * Description: The small icons the left panels share (search, close, check, chevrons, up and down),
 *   drawn on the same 16px, 1.5px stroke family as icons.tsx.
 */
import type { SVGProps } from "react";
import { Icon } from "./icons";

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2L13.5 13.5" />
  </Icon>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
);
export const IconChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 10l4-4 4 4" />
  </Icon>
);
export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);
