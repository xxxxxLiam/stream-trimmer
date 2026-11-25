/**
 * File: BarIcons.tsx
 * Path: src/renderer/src/modules/layout/components/BarIcons.tsx
 * Description: The top bar and bottom bar icons, traced from board 03.2.1 (16px box, 1.5 stroke).
 */
import { Icon } from "../../../shared/components/icons";

export const IconPlus = () => (
  <Icon width={14} height={14}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);
export const IconMore = () => (
  <Icon width={14} height={14}>
    <circle cx="4" cy="8" r=".8" />
    <circle cx="8" cy="8" r=".8" />
    <circle cx="12" cy="8" r=".8" />
  </Icon>
);
export const IconPanels = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M6 3v10" />
  </Icon>
);
export const IconSettingsGear = () => (
  <Icon>
    <path d="M6.54 3.22L6.85 1.50L9.15 1.50L9.46 3.22L10.35 3.59L11.79 2.59L13.41 4.21L12.41 5.65L12.78 6.54L14.50 6.85L14.50 9.15L12.78 9.46L12.41 10.35L13.41 11.79L11.79 13.41L10.35 12.41L9.46 12.78L9.15 14.50L6.85 14.50L6.54 12.78L5.65 12.41L4.21 13.41L2.59 11.79L3.59 10.35L3.22 9.46L1.50 9.15L1.50 6.85L3.22 6.54L3.59 5.65L2.59 4.21L4.21 2.59L5.65 3.59Z" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);
export const IconPointer = () => (
  <Icon>
    <path d="M4 2l8 6-4 1-2 4z" />
  </Icon>
);
export const IconScissors = () => (
  <Icon>
    <circle cx="4.5" cy="11.5" r="2" />
    <circle cx="11.5" cy="11.5" r="2" />
    <path d="M5.8 10L12 2.5M10.2 10L4 2.5" />
  </Icon>
);
export const IconRange = () => (
  <Icon>
    <path d="M3.5 3v10M12.5 3v10M3.5 8h9M6 6l-2.5 2L6 10M10 6l2.5 2L10 10" />
  </Icon>
);
export const IconFlag = () => (
  <Icon>
    <path d="M4 14V2M4 3h8l-2 3 2 3H4" />
  </Icon>
);
export const IconHand = () => (
  <Icon>
    <path d="M5 8V3.5a1 1 0 012 0V7M7 7V2.5a1 1 0 012 0V7M9 7V3.5a1 1 0 012 0V9c0 3-2 5-4.5 5S3 12 3 10V8.5a1 1 0 012 0" />
  </Icon>
);
export const IconZoomTool = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14M5 7h4M7 5v4" />
  </Icon>
);
export const IconChevronSmall = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    <path d="M2 3.5l3 3 3-3" />
  </svg>
);
