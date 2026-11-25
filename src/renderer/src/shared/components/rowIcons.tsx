/**
 * File: rowIcons.tsx
 * Path: src/renderer/src/shared/components/rowIcons.tsx
 * Description: 14px icons for Export and History rows, paths as drawn on the workspace board.
 */
import type { ReactNode } from "react";

function Row14({ children }: { children: ReactNode }) {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="flex-none">
      {children}
    </svg>
  );
}

export const IconUndo = () => (
  <Row14>
    <path d="M5 6H10a3 3 0 010 6H7M5 6l2.5-2.5M5 6l2.5 2.5" />
  </Row14>
);
export const IconShowFile = () => (
  <Row14>
    <path d="M2 5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
  </Row14>
);
export const IconInEditor = () => (
  <Row14>
    <rect x="2" y="3" width="12" height="8" rx="1.5" />
    <path d="M6 14h4M8 11v3" />
  </Row14>
);
export const IconJumpToSource = () => (
  <Row14>
    <path d="M5 11l6-6M6 5h5v5" />
  </Row14>
);
export const IconSearch = () => (
  <Row14>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Row14>
);
export const IconClose = () => (
  <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
export const IconRemove = () => (
  <Row14>
    <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
  </Row14>
);
export const IconMake = () => (
  <Row14>
    <path d="M4 3.5v9l8-4.5z" />
  </Row14>
);

export const IconCopy = () => (
  <Row14>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" />
  </Row14>
);
export const IconSaveFile = () => (
  <Row14>
    <path d="M8 2.5v7M5 6.8L8 9.8l3-3M3 12.5h10" />
  </Row14>
);
export const IconMore = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className="flex-none">
    <circle cx="3.5" cy="8" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="12.5" cy="8" r="1.2" />
  </svg>
);
export const IconRename = () => (
  <Row14>
    <path d="M10.5 3.5l2 2M3 13l.5-2.5 7-7 2 2-7 7z" />
  </Row14>
);
export const IconOpenOnSite = () => (
  <Row14>
    <path d="M7 3H3.5A1 1 0 002.5 4v8.5a1 1 0 001 1H12a1 1 0 001-1V9M9.5 2.5h4v4M13.5 2.5L7.5 8.5" />
  </Row14>
);
