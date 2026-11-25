/**
 * File: rowIcons.tsx
 * Path: src/renderer/src/shared/components/rowIcons.tsx
 * Description: 14px Bootstrap Icons for Export and History rows.
 */
import {
  ArrowCounterclockwise,
  ArrowUpRight,
  BoxArrowUpRight,
  Copy,
  Display,
  Download,
  Folder2Open,
  Pencil,
  PlayFill,
  Search,
  ThreeDots,
  Trash,
  X,
} from "react-bootstrap-icons";
import { glyph } from "./icons";

const Undo = glyph(ArrowCounterclockwise, 14);
const ShowFile = glyph(Folder2Open, 14);
const InEditor = glyph(Display, 14);
const Jump = glyph(ArrowUpRight, 14);
const SearchG = glyph(Search, 14);
const Close = glyph(X, 12);
const Remove = glyph(Trash, 14);
const Make = glyph(PlayFill, 14);
const CopyG = glyph(Copy, 14);
const Save = glyph(Download, 14);
const More = glyph(ThreeDots, 16);
const Rename = glyph(Pencil, 14);
const OnSite = glyph(BoxArrowUpRight, 14);

export const IconUndo = () => <Undo className="flex-none" />;
export const IconShowFile = () => <ShowFile className="flex-none" />;
export const IconInEditor = () => <InEditor className="flex-none" />;
export const IconJumpToSource = () => <Jump className="flex-none" />;
export const IconSearch = () => <SearchG className="flex-none" />;
export const IconClose = () => <Close />;
export const IconRemove = () => <Remove className="flex-none" />;
export const IconMake = () => <Make className="flex-none" />;
export const IconCopy = () => <CopyG className="flex-none" />;
export const IconSaveFile = () => <Save className="flex-none" />;
export const IconMore = () => <More className="flex-none" />;
export const IconRename = () => <Rename className="flex-none" />;
export const IconOpenOnSite = () => <OnSite className="flex-none" />;
