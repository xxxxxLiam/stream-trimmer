/**
 * File: StartFreshDialog.tsx
 * Path: src/renderer/src/features/start/components/StartFreshDialog.tsx
 * Description: The one-time "Clipr has changed a lot" prompt, shown on the first launch after
 *   updating from an earlier version. Start fresh backs the data up and opens Clipr like new; Keep
 *   my data closes it. There is no "remind me later" and Esc and an outside click do nothing, so the
 *   question is answered once. Logic-free: the hook owns the answer.
 */
import { useRef } from "react";
import { useModalFocus } from "../../../shared/hooks/useModalFocus";
import BrandMark from "../../../shared/components/BrandMark";
import Button from "../../../shared/components/Button";

export type StartFreshDialogProps = {
  busy: boolean;
  /** The sentence from a failed backup; the dialog stays so nothing is lost. */
  error: string;
  onStartFresh: () => void;
  onKeep: () => void;
};

const Tick = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className="mt-[2px] shrink-0 text-fg-dim"
  >
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
);
const Shield = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className="mt-[2px] shrink-0 text-fg-dim"
  >
    <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" />
  </svg>
);

export default function StartFreshDialog({
  busy,
  error,
  onStartFresh,
  onKeep,
}: StartFreshDialogProps) {
  const root = useRef<HTMLDivElement | null>(null);
  // A3-4: focus starts on Keep my data (the harmless choice), stays in the dialog, and Tab wraps inside it.
  const onKeyDown = useModalFocus(root, "[data-start-fresh-first]");
  return (
    <div
      data-covers-app=""
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-overlay-50 p-[32px]"
    >
      <div
        ref={root}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-start-fresh-title"
        id="ui-start-fresh"
        className="surface-panel flex w-full max-w-[520px] flex-col gap-[16px] rounded-panel border border-hairline p-[32px] shadow-drawer"
      >
        <BrandMark size={32} />
        <h2
          id="ui-start-fresh-title"
          className="text-title font-medium text-fg"
        >
          Clipr has changed a lot
        </h2>
        <p className="text-body text-fg-dim">
          Most screens work differently now. Starting fresh is the easiest way
          to learn the new layout.
        </p>
        <ul className="flex flex-col gap-[12px] text-body text-fg">
          <li className="flex gap-[12px]">
            <Tick />
            <span>
              Your campaigns, bank, history and settings go into a backup first.
              Nothing is deleted.
            </span>
          </li>
          <li className="flex gap-[12px]">
            <Tick />
            <span>Clipr opens like new and walks you through setup again.</span>
          </li>
          <li className="flex gap-[12px]">
            <Shield />
            <span>Clips you already made stay in your folders, untouched.</span>
          </li>
        </ul>
        {error && (
          <p
            role="alert"
            className="rounded-control border border-error px-[12px] py-[8px] text-body text-error"
          >
            {error}
          </p>
        )}
        <div className="flex gap-[12px]">
          <Button
            autoFocus
            variant="primary"
            className="flex-1"
            disabled={busy}
            onClick={onStartFresh}
          >
            Start fresh
            <span className="text-meta font-normal">· Recommended</span>
          </Button>
          <Button variant="secondary" data-start-fresh-first="" disabled={busy} onClick={onKeep}>
            Keep my data
          </Button>
        </div>
        <p className="text-meta text-fg-dim">
          Backup goes to Documents/Clipr backups/&lt;date&gt;. You only see this
          once.
        </p>
      </div>
    </div>
  );
}
