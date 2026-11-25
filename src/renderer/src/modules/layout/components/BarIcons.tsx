/**
 * File: BarIcons.tsx
 * Path: src/renderer/src/modules/layout/components/BarIcons.tsx
 * Description: The top bar and bottom bar icons, Bootstrap Icons at the sizes board 03.2.1 uses.
 */
import { BoundingBox, ChevronDown, Cursor, Flag, HandIndex, LayoutSidebarInset, Plus, Scissors, ThreeDots, ZoomIn } from "react-bootstrap-icons";
import { glyph } from "../../../shared/components/icons";

const Plus14 = glyph(Plus, 14);
const More14 = glyph(ThreeDots, 14);
const Panels = glyph(LayoutSidebarInset);
const Pointer = glyph(Cursor);
const Scissor = glyph(Scissors);
const Range = glyph(BoundingBox);
const Flagged = glyph(Flag);
const Hand = glyph(HandIndex);
const Zoom = glyph(ZoomIn);
const Chevron10 = glyph(ChevronDown, 10);

export const IconPlus = () => <Plus14 />;
export const IconMore = () => <More14 />;
export const IconPanels = () => <Panels />;
export { IconGear as IconSettingsGear } from "../../../shared/components/icons";
export const IconPointer = () => <Pointer />;
export const IconScissors = () => <Scissor />;
export const IconRange = () => <Range />;
export const IconFlag = () => <Flagged />;
export const IconHand = () => <Hand />;
export const IconZoomTool = () => <Zoom />;
export const IconChevronSmall = () => <Chevron10 />;
