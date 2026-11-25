/**
 * File: icons.tsx
 * Path: src/renderer/src/shared/components/icons.tsx
 * Description: One family of 16px stroke-only icons (1.4 stroke width, as the boards draw them), shared by
 *   the shell. Decorative by default (aria-hidden); label the parent button.
 */
import type { ReactNode, SVGProps } from "react";

export function Icon({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHelp = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.5 6.3a1.6 1.6 0 113 .7c-.6.4-1.5.8-1.5 1.7M8 11h0" />
  </Icon>
);
/** The standard settings gear: eight teeth round a hub. */
export const IconGear = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.54 3.22L6.85 1.50L9.15 1.50L9.46 3.22L10.35 3.59L11.79 2.59L13.41 4.21L12.41 5.65L12.78 6.54L14.50 6.85L14.50 9.15L12.78 9.46L12.41 10.35L13.41 11.79L11.79 13.41L10.35 12.41L9.46 12.78L9.15 14.50L6.85 14.50L6.54 12.78L5.65 12.41L4.21 13.41L2.59 11.79L3.59 10.35L3.22 9.46L1.50 9.15L1.50 6.85L3.22 6.54L3.59 5.65L2.59 4.21L4.21 2.59L5.65 3.59Z" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
    <circle cx="10.5" cy="4.5" r="1.5" />
    <circle cx="5.5" cy="11.5" r="1.5" />
  </Icon>
);
export const IconFolder = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M1.75 4.25a1 1 0 0 1 1-1h3l1.5 1.75h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z" />
  </Icon>
);
export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 6.25 8 10l4-3.75" />
  </Icon>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" />
    <path d="M10.75 5.25v-1a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h1" />
  </Icon>
);
export const IconSymbol = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 12.5h2.2c-1.9-1.2-2.7-2.7-2.7-4.4a5 5 0 0 1 10 0c0 1.7-.8 3.2-2.7 4.4h2.2" />
  </Icon>
);
export const IconChannel = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 3.5h12M2 8h12M2 12.5h7" />
  </Icon>
);
