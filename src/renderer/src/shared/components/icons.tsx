/**
 * File: icons.tsx
 * Path: src/renderer/src/shared/components/icons.tsx
 * Description: The shell's icons are Bootstrap Icons (react-bootstrap-icons), 16px by default and
 *   currentColor. Decorative by default (aria-hidden); label the parent button. `Icon` stays for the few
 *   one-off drawings that have no Bootstrap glyph.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { ChevronDown, Copy, Fonts, Folder, Gear, List, QuestionCircle, Sliders } from "react-bootstrap-icons";

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

type BsGlyph = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;

/** Wrap a Bootstrap glyph as a decorative icon at `size` px; width/height props still override. */
export function glyph(Svg: BsGlyph, size = 16) {
  return function GlyphIcon(p: SVGProps<SVGSVGElement>) {
    return <Svg width={size} height={size} aria-hidden="true" focusable="false" {...p} />;
  };
}

export const IconHelp = glyph(QuestionCircle);
export const IconGear = glyph(Gear);
export const IconSettings = glyph(Sliders);
export const IconFolder = glyph(Folder);
export const IconChevronDown = glyph(ChevronDown);
export const IconCopy = glyph(Copy);
export const IconSymbol = glyph(Fonts);
export const IconChannel = glyph(List);
