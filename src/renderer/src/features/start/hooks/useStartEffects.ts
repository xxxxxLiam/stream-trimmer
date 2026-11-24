/**
 * File: useStartEffects.ts
 * Path: src/renderer/src/features/start/hooks/useStartEffects.ts
 * Description: Looks at the clipboard when the window opens or regains focus so a copied YouTube link
 *   can be offered. Nothing here opens a video by itself. Paste anywhere is the app's one global
 *   paste handler (usePasteRoutingEffects).
 */
import { useEffect, useState } from "react";
import { youtubeLinkFromText } from "../utils/startUtils";

export function useStartEffects({ active }: { active: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

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
