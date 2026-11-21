/**
 * File: CopyBlocks.tsx
 * Path: src/components/CopyBlocks.tsx
 * Description: Copy-blocks handoff panel (opened with Cmd+Shift+C by the shell).
 *   One row per block: label, one-line note, monospace preview, Copy button.
 *   Blocks are never concatenated, each goes somewhere different.
 * Contract: self-positioned (fixed) panel at z-20, UNDER the header (z-30) so it can never cover
 *   the header's own controls or the "?" (F-3). Null when closed. Owns its own Escape.
 *   `input` carries the live video, transcript and segments; Phase C passes it
 *   from App. Without it the panel says there is nothing to copy yet.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildHandoffBlocks, writeClipboard, type HandoffInput } from "../lib/handoff";

export type CopyBlocksProps = {
  open: boolean;
  onClose: () => void;
  input?: HandoffInput;
};

const CONFIRM_MS = 1200;
const PREVIEW_LINES = 3;

// useLayoutEffect warns when the panel is rendered to a string (the help catalogue test does).
const useLayoutEffectOnClient = typeof window === "undefined" ? useEffect : useLayoutEffect;

const EDGE_GAP = 16;

/**
 * How far in from the right edge the panel sits. The help drawer is a 400px column on the right
 * and is drawn above this panel (F-3), so with the drawer open the panel moves to its left instead
 * of hiding behind it: the tutorial asks the user to press a block here while the drawer is up.
 */
function rightOffset(): number {
  const drawer = typeof document === "undefined" ? null : document.getElementById("ui-help-drawer");
  if (!drawer) return EDGE_GAP;
  const r = drawer.getBoundingClientRect();
  // Stacked under the app (narrow window): it is not at the right edge, nothing to dodge.
  return r.left > 0 && r.width > 0 ? Math.round(window.innerWidth - r.left) + EDGE_GAP : EDGE_GAP;
}

const EMPTY: HandoffInput = { lines: [], segments: [] };

function preview(text: string): string {
  const lines = text.split("\n");
  const head = lines.slice(0, PREVIEW_LINES).join("\n");
  return lines.length > PREVIEW_LINES ? `${head}\n+ ${lines.length - PREVIEW_LINES} more lines` : head;
}

export default function CopyBlocks({ open, onClose, input }: CopyBlocksProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  const [right, setRight] = useState(EDGE_GAP);

  useLayoutEffectOnClient(() => {
    if (!open) return;
    const update = () => setRight(rightOffset());
    update();
    window.addEventListener("resize", update);
    // The drawer opens and closes without telling this panel.
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", update);
      mo.disconnect();
    };
  }, [open]);

  const blocks = useMemo(() => buildHandoffBlocks(input ?? EMPTY), [input]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCopied(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const down = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>("button[data-copy]:not(:disabled)")?.focus());
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", down);
      window.clearTimeout(timer.current);
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async (id: string, text: string) => {
    const res = await writeClipboard(text);
    if (!res.ok) {
      setCopied(null);
      setError(res.error);
      return;
    }
    setError(null);
    setCopied(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), CONFIRM_MS);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Copy blocks"
      className="surface-panel fixed top-14 z-20 flex max-h-[calc(100vh-72px)] w-[560px] max-w-[calc(100vw-32px)] flex-col gap-3 p-4 shadow-drawer"
      style={{ right }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="t-section">Copy blocks</h2>
          <p className="t-meta">Timecodes are the source video's. Each block goes somewhere different.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close copy blocks" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {error && (
        <div role="alert" className="card-alert px-3 py-2 text-body">
          {error}
        </div>
      )}

      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {blocks.map((b, i) => {
          const done = copied === b.id;
          return (
            <li key={b.id} className="surface-raised flex items-start gap-3 rounded-control border border-hairline p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-body">
                  <span className="text-fg-dim">{i + 1}. </span>
                  {b.label}
                </div>
                <div className="t-meta">{b.available ? b.note : b.reason}</div>
                {b.available && (
                  <pre
                    dir="auto"
                    className="m-0 max-h-[72px] overflow-hidden whitespace-pre-wrap break-words font-mono text-meta text-fg"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    {preview(b.text)}
                  </pre>
                )}
              </div>
              <button
                type="button"
                // A stable id per block: `ui-copy-block-transcript`, `ui-copy-block-script`, ... The
                // help tutorials point their spotlight at these.
                id={`ui-copy-block-${b.id}`}
                data-copy
                className="btn min-w-[84px] shrink-0"
                disabled={!b.available}
                aria-label={`Copy ${b.label}`}
                onClick={() => void copy(b.id, b.text)}
                style={done ? { borderColor: "var(--accent)" } : undefined}
              >
                {done ? "Copied" : "Copy"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
