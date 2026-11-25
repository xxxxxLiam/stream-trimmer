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
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
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
