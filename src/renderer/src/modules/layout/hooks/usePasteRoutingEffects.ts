/**
 * File: usePasteRoutingEffects.ts
 * Path: src/renderer/src/modules/layout/hooks/usePasteRoutingEffects.ts
 * Description: The one global paste handler. A paste anywhere outside a text field is routed by
 *   what it holds (see pasteRouting.ts). A paste into a text field is left to that field.
 */
import { useEffect, useRef } from "react";
import { classifyPaste, type PasteRules } from "../../../shared/utils/pasteRouting";

export type PasteHandlers = {
  onVideo?: (url: string) => void;
  /** Rows with times: open Import moments with this text. */
  onMoments?: (text: string) => void;
  /** A channel link: open Channel data with it. */
  onChannel?: (url: string) => void;
};

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function usePasteRoutingEffects(active: boolean, handlers: PasteHandlers, rules: PasteRules) {
  const ref = useRef({ handlers, rules });
  ref.current = { handlers, rules };
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      if (inTextField(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const { handlers: h, rules: r } = ref.current;
      const kind = classifyPaste(text, r);
      const run = kind === "video" ? h.onVideo : kind === "moments" ? h.onMoments : kind === "channel" ? h.onChannel : undefined;
      if (!run) return;
      e.preventDefault();
      run(text.trim());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active]);
}
