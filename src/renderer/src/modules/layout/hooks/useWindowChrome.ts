/**
 * File: useWindowChrome.ts
 * Path: src/renderer/src/modules/layout/hooks/useWindowChrome.ts
 * Description: The main window's frame as the page sees it: whether the macOS traffic lights sit in the
 *   top bar or the Windows buttons sit over it, and whether the window is full screen right now. Off
 *   Electron (and on Linux) it reads as a plain frame.
 */
import { useEffect, useState } from "react";
import type { WindowChrome } from "../utils/topBarInset";

const PLAIN: WindowChrome = { macInset: false, winOverlay: false, fullScreen: false };

export function useWindowChrome(): WindowChrome {
  const [chrome, setChrome] = useState<WindowChrome>(PLAIN);
  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.electronAPI;
    if (!api?.getWindowChrome) return;
    let live = true;
    void api.getWindowChrome().then((c) => live && setChrome(c)).catch(() => undefined);
    const off = api.onFullScreen?.((fullScreen) => setChrome((c) => ({ ...c, fullScreen })));
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return chrome;
}
