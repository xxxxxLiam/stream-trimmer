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
import { useEffect, useMemo, useRef, useState } from "react";
import { buildHandoffBlocks, writeClipboard, type HandoffInput } from "../lib/handoff";

import CentredDialog from "./shell/CentredDialog";

export type CopyBlocksProps = {
  open: boolean;
  onClose: () => void;
  input?: HandoffInput;
};

const CONFIRM_MS = 1200;
const PREVIEW_LINES = 3;

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


  const blocks = useMemo(() => buildHandoffBlocks(input ?? EMPTY), [input]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCopied(null);
    // Esc and the outside click belong to CentredDialog now; this only sets up the panel.
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>("button[data-copy]:not(:disabled)")?.focus());
    return () => {
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
    <CentredDialog
      open={open}
      onClose={onClose}
      title="Copy blocks"
      widthClass="max-w-[760px]"
      aside={<p className="t-meta truncate">Timecodes are the source video's. Each block goes somewhere different.</p>}
    >
      <div ref={panelRef} className="flex min-h-0 flex-col gap-3">

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
    </CentredDialog>
  );
}
