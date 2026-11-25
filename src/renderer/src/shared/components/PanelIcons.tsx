/**
 * File: PanelIcons.tsx
 * Path: src/renderer/src/shared/components/PanelIcons.tsx
 * Description: The small icons the left panels share (search, close, check, chevrons), Bootstrap Icons at 16px.
 */
import { Check2, ChevronDown, ChevronUp, Search, X } from "react-bootstrap-icons";
import { glyph } from "./icons";

export const IconSearch = glyph(Search);
export const IconClose = glyph(X);
export const IconCheck = glyph(Check2);
export const IconChevronUp = glyph(ChevronUp);
export const IconChevronDown = glyph(ChevronDown);
