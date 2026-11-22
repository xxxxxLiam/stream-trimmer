/**
 * File: HelpDrawer.tsx
 * Path: src/components/HelpDrawer.tsx
 * Description: Right-side help drawer (BUILD-SPEC section 7). Search a task, pick
 *   it, and a step walker highlights the real control for each step via Spotlight.
 *   It is a flex sibling of the app, never an overlay, so it stays open while you
 *   work. Opened by the header button or Cmd /, closed by Escape (both wired by the
 *   shell; Escape is also handled here).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CHANNEL_HELP_TASKS, HELP_TASKS, searchTasks, type HelpTask } from "../lib/helpTasks";
import SetupChecklist from "./SetupChecklist";
import Spotlight from "./Spotlight";
import { isSignInGateUp, useYouTubeConnection } from "../lib/youtubeConnection";

import CentredDialog from "./shell/CentredDialog";

export type HelpDrawerProps = { open: boolean; onClose: () => void };

// Static flag: a public build compiles the exporter out, and its help tasks with it.
const TASKS: HelpTask[] = import.meta.env.VITE_ENABLE_CHANNEL_DATA
  ? [...HELP_TASKS, ...CHANNEL_HELP_TASKS]
  : HELP_TASKS;

export default function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [query, setQuery] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [present, setPresent] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  // AF2-3: the sign-in gate makes the app inert, this drawer with it. A drawer that stays drawn
  // over the gate is visible, dead and click-through, so it is closed while the gate is up.
  const gateUp = isSignInGateUp(useYouTubeConnection());
  useEffect(() => {
    if (open && gateUp) onClose();
  }, [open, gateUp, onClose]);
  const searchRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const results = useMemo(() => searchTasks(TASKS, query), [query]);
  const task = taskId ? (TASKS.find((t) => t.id === taskId) ?? null) : null;
  const current = task?.steps[step] ?? null;

  // Focus the search field on open; give focus back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    returnTo.current = (document.activeElement as HTMLElement | null) ?? null;
    searchRef.current?.focus();
    return () => {
      const aside = asideRef.current;
      const active = document.activeElement;
      const lost = !active || active === document.body || (aside && aside.contains(active));
      if (lost) {
        const back = returnTo.current?.isConnected
          ? returnTo.current
          : document.getElementById("ui-help-button");
        back?.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || gateUp) return null;

  const pick = (id: string) => {
    setTaskId(id);
    setStep(0);
  };
  const backToList = () => {
    setTaskId(null);
    setStep(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const last = task ? step >= task.steps.length - 1 : false;

  return (
    // Non-modal on purpose: a tutorial step spotlights a real control and asks you to press
    // it, so a scrim over the app would make the step impossible to follow.
    <CentredDialog
      open
      onClose={onClose}
      title="Help"
      widthClass="max-w-[720px]"
      id="ui-help-drawer"
      modal={false}
    >
      <div ref={asideRef} className="flex min-h-0 flex-col">

      <div className="px-4 pb-3">
        <button
          type="button"
          id="help-setup-toggle"
          className="btn w-full justify-between"
          aria-expanded={setupOpen}
          aria-controls="help-setup-panel"
          onClick={() => setSetupOpen((v) => !v)}
        >
          <span>Setup checklist</span>
          <span className="text-meta text-fg-dim">{setupOpen ? "Hide" : "Optional"}</span>
        </button>
        {setupOpen && (
          <div id="help-setup-panel" className="mt-3 max-h-[50vh] overflow-y-auto">
            <SetupChecklist />
          </div>
        )}
      </div>

      <div className="px-4 pb-3">
        <label htmlFor="help-search" className="mb-1 block text-meta text-fg-dim">
          What are you trying to do?
        </label>
        <input
          ref={searchRef}
          id="help-search"
          type="search"
          className="field w-full"
          value={query}
          placeholder="e.g. cut a clip, change folder"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setTaskId(null);
            setStep(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              asideRef.current?.querySelector<HTMLElement>("[data-help-result]")?.focus();
            }
          }}
        />
        <p className="mt-1 text-meta text-fg-dim" role="status" aria-live="polite">
          {results.length === 0
            ? "No task matches. Try clip, folder, copy or symbol."
            : `${results.length} ${results.length === 1 ? "task" : "tasks"}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-4 py-3">
        {!task ? (
          <ul className="flex flex-col gap-1" aria-label="Matching tasks">
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-help-result
                  className="flex h-row w-full items-center justify-between gap-2 rounded-control border border-transparent px-2 text-left text-body hover:border-hairlineStrong hover:bg-hover"
                  onClick={() => pick(t.id)}
                  onKeyDown={(e) => {
                    const li = e.currentTarget.parentElement;
                    const to =
                      e.key === "ArrowDown" ? li?.nextElementSibling
                      : e.key === "ArrowUp" ? li?.previousElementSibling
                      : null;
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      if (to) to.querySelector<HTMLElement>("button")?.focus();
                      else if (e.key === "ArrowUp") searchRef.current?.focus();
                    }
                  }}
                >
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className="shrink-0 text-meta text-fg-dim">{t.steps.length} steps</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <section aria-label={task.title} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <button type="button" className="link-quiet" onClick={backToList}>
                All tasks
              </button>
            </div>
            <h3 className="text-section">{task.title}</h3>

            <ol className="flex flex-col gap-2">
              {task.steps.map((s, i) => {
                const isCurrent = i === step;
                return (
                  <li
                    key={i}
                    aria-current={isCurrent ? "step" : undefined}
                    className={
                      "flex gap-3 rounded-control border p-3 " +
                      (isCurrent ? "border-accent bg-raised" : "border-hairline")
                    }
                  >
                    <span
                      className={
                        "mt-px flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-meta " +
                        (isCurrent ? "bg-accent text-accent-on" : "border border-hairlineStrong text-fg-dim")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={isCurrent ? "text-body text-fg" : "text-body text-fg-dim"}>{s.do}</p>
                      {isCurrent && <p className="mt-1 text-meta text-fg-dim">{s.why}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>

            {!present && current && current.anchorId && (
              <p role="status" className="rounded-control border border-accent bg-accent-soft p-3 text-meta text-accent">
                That control is not on screen right now. It may be on another screen or tab, or it
                appears once a video is loaded.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
              <span className="flex-1 text-center text-meta text-fg-dim" aria-live="polite">
                Step {step + 1} of {task.steps.length}
              </span>
              {last ? (
                <button type="button" className="btn-primary" onClick={backToList}>
                  Done
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                  Next step
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Highlight on the live UI. Fixed, non-interactive, no overlay. */}
      {task && current && (
        <Spotlight key={`${task.id}:${step}`} anchorId={current.anchorId} n={step + 1} onPresence={setPresent} />
      )}
      </div>
    </CentredDialog>
  );
}
