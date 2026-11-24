/**
 * File: usePreviewState.ts
 * Path: src/renderer/src/features/player/hooks/usePreviewState.ts
 * Description: The preview's own switches: loop on or off, full screen, and whether the full-screen
 *   bar is showing.
 */
import { useState } from "react";

export const BAR_HIDE_MS = 3000;

export function usePreviewState() {
  const [loop, setLoop] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  return { loop, setLoop, fullScreen, setFullScreen, barVisible, setBarVisible };
}
