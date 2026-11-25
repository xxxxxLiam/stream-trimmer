/**
 * File: TitleBarDrag.tsx
 * Path: src/renderer/src/modules/layout/components/TitleBarDrag.tsx
 * Description: A strip across the top of a screen that has no top bar (the start screen, the crash
 *   screen), so the window still moves by its top edge where the native title bar is hidden.
 */
import { useWindowChrome } from "../hooks/useWindowChrome";
import { barIsTitleBar } from "../utils/topBarInset";

export const TITLE_BAR_DRAG_HEIGHT = 44;

export default function TitleBarDrag() {
  const chrome = useWindowChrome();
  if (!barIsTitleBar(chrome)) return null;
  return <div id="ui-title-drag" aria-hidden="true" className="topbar-drag fixed inset-x-0 top-0" style={{ height: TITLE_BAR_DRAG_HEIGHT }} />;
}
