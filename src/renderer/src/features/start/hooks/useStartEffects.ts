/**
 * File: useStartEffects.ts
 * Path: src/renderer/src/features/start/hooks/useStartEffects.ts
 * Description: Listeners for the cold start: a paste anywhere on the screen hands the text over, and
 *   the clipboard is looked at when the window opens or regains focus so a copied YouTube link can be
 *   offered. Nothing here opens a video by itself.
 */
import { useEffect, useState } from "react";
import { youtubeLinkFromText } from "../utils/startUtils";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useStartEffects({ active, onPasted }: { active: boolean; onPasted: (text: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  // Paste anywhere. The link box handles its own paste as plain typing, so skip it here.
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      onPasted(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, onPasted]);

  // A copied link is offered, quietly. Reading can be refused (focus, permission): then no offer.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const look = () => {
      navigator.clipboard
        ?.readText()
        .then((t) => alive && setCopied(youtubeLinkFromText(t)))
        .catch(() => alive && setCopied(null));
    };
    look();
    window.addEventListener("focus", look);
    return () => {
      alive = false;
      window.removeEventListener("focus", look);
    };
  }, [active]);

  return { copied };
}
