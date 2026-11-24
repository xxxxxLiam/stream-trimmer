/**
 * File: DiagnosticsDisclosure.tsx
 * Path: src/renderer/src/shared/components/DiagnosticsDisclosure.tsx
 * Description: Surfaces the desktop app's local diagnostic log so a crash or a
 * rejected cookies.txt can be reported without hunting for a hidden folder.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  FolderSymlink,
} from "react-bootstrap-icons";
import {
  buildDiagnosticsBundle,
  fenceForClipboard,
  offersDeveloperDiagnostics,
  redact,
  type FailureAttempt,
  type FailureDiagnostics,
} from "../utils/diagnostics";
import { writeClipboard } from "../utils/handoff";

const CONFIRM_MS = 1200;

/**
 * The per-failure report. Shown only when the failure is the developer's to fix: for the
 * failures the user can fix themselves, and for a response that carries no `code` at all
 * (F-8), it renders nothing, because the fix is already on screen. Separate from the whole-log disclosure below.
 */
export function CopyFailureDiagnostics({
  code,
  message,
  attempt,
  diagnostics,
  label = "Copy diagnostics",
}: {
  label?: string;
  code?: string;
  message: string;
  attempt?: FailureAttempt;
  diagnostics?: FailureDiagnostics;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // New failure, fresh button.
  useEffect(() => setState("idle"), [message, code]);

  if (!offersDeveloperDiagnostics(code, message)) return null;

  const copy = async () => {
    const report = buildDiagnosticsBundle({
      code,
      message,
      attempt,
      diagnostics,
      now: new Date(),
    });
    const res = await writeClipboard(fenceForClipboard(report));
    setState(res.ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), res.ok ? CONFIRM_MS : 4000);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn flex items-center gap-2"
        onClick={() => void copy()}
        style={state === "copied" ? { borderColor: "var(--accent)" } : undefined}
      >
        <Clipboard size={12} />
        {state === "copied" ? "Copied" : label}
      </button>
      {state === "failed" ? (
        <span role="status" className="text-meta text-fg-dim">
          Could not copy. Select the text and press Cmd+C.
        </span>
      ) : null}
    </span>
  );
}

export default function DiagnosticsDisclosure() {
  const api = typeof window === "undefined" ? undefined : window.electronAPI;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [logPath, setLogPath] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!api?.readDiagnostics) return;
    try {
      const result = await api.readDiagnostics();
      // Main already scrubs both. This second pass is for the day a new reader forgets: whatever
      // reaches this <pre> sits under a sentence promising no cookies, tokens or personal data.
      setLogPath(result.path ? redact(result.path) : result.path);
      setText(redact(result.text) || "The log is empty.");
    } catch {
      setText("Could not read the log. Try Refresh.");
    }
  }, [api]);

  // Nothing to show in the browser preview. There is no local log.
  if (!api?.readDiagnostics) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-meta text-fg-dim hover:text-fg"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Diagnostics
      </button>

      {open ? (
        <div className="mt-2">
          <p className="text-meta leading-relaxed text-fg-dim">
            The app's event log. It records what happened and when, with no
            cookies, tokens or personal data. If the app closed unexpectedly,
            the cause is here.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn flex items-center gap-2"
              onClick={() => void load()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn flex items-center gap-2"
              onClick={async () => {
                const result = await api.copyDiagnostics?.();
                setNote(result?.ok ? "Copied to clipboard." : "Could not copy the log.");
              }}
            >
              <Clipboard size={12} />
              Copy log
            </button>
            <button
              type="button"
              className="btn flex items-center gap-2"
              onClick={async () => {
                const result = await api.revealDiagnostics?.();
                if (!result?.ok) setNote(result?.error || "No log file yet.");
              }}
            >
              <FolderSymlink size={12} />
              Show file
            </button>
          </div>

          {note ? (
            <p className="mt-2 text-meta text-fg-dim">{note}</p>
          ) : null}
          {logPath ? (
            <p className="mt-2 break-all text-meta text-fg-dim">{logPath}</p>
          ) : null}

          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-chip bg-bg-deep/60 p-2 text-meta leading-relaxed text-fg-dim">
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
