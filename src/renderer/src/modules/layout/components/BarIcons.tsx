/**
 * File: BarIcons.tsx
 * Path: src/renderer/src/modules/layout/components/BarIcons.tsx
 * Description: The top bar and bottom bar icons, Bootstrap Icons at the sizes board 03.2.1 uses.
 */
import { ChevronDown, Cursor, DistributeHorizontal, Flag, LayoutSidebarInset, Plus, Scissors, ThreeDots, ZoomIn } from "react-bootstrap-icons";
import { glyph, Icon } from "../../../shared/components/icons";

const Plus14 = glyph(Plus, 14);
const More14 = glyph(ThreeDots, 14);
const Panels = glyph(LayoutSidebarInset);
// Bootstrap's cursor points up-right; the Pointer tool faces up-left, so it is mirrored.
const PointerG = glyph(Cursor);
const Scissor = glyph(Scissors);
// Two bounds with the part between them: reads as a range (Bootstrap has no brackets glyph).
const Range = glyph(DistributeHorizontal);
const Flagged = glyph(Flag);
const Zoom = glyph(ZoomIn);
const Chevron10 = glyph(ChevronDown, 10);

export const IconPlus = () => <Plus14 />;
export const IconMore = () => <More14 />;
export const IconPanels = () => <Panels />;
export { IconGear as IconSettingsGear } from "../../../shared/components/icons";
export const IconPointer = () => <PointerG style={{ transform: "scaleX(-1)" }} />;
export const IconScissors = () => <Scissor />;
export const IconRange = () => <Range />;
export const IconFlag = () => <Flagged />;
// Bootstrap has no open hand (only pointing-finger and thumbs hands), so the Hand tool keeps its drawn open hand.
export const IconHand = () => (
  <Icon>
    <path d="M5 8V3.5a1 1 0 012 0V7M7 7V2.5a1 1 0 012 0V7M9 7V3.5a1 1 0 012 0V9c0 3-2 5-4.5 5S3 12 3 10V8.5a1 1 0 012 0" />
  </Icon>
);
export const IconZoomTool = () => <Zoom />;
export const IconChevronSmall = () => <Chevron10 />;
