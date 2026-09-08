/**
 * File: DiagnosticsDisclosure.tsx
 * Path: src/components/DiagnosticsDisclosure.tsx
 * Description: Surfaces the desktop app's local diagnostic log so a crash or a
 * failed sign-in can be reported without hunting for a hidden folder.
 */
import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  FolderSymlink,
} from "react-bootstrap-icons";

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
      setLogPath(result.path);
      setText(result.text || "(the log is empty)");
    } catch {
      setText("Could not read the log.");
    }
  }, [api]);

  // Nothing to show in the browser preview — there is no local log there.
  if (!api?.readDiagnostics) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-muted"
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
          <p className="text-[11px] leading-relaxed text-fg-faint">
            The app's own event log. It records what happened and when — no
            cookies, tokens or personal data. If the app closed unexpectedly,
            this is what shows why.
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
                setNote(result?.ok ? "Copied to clipboard." : "Copy failed.");
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
            <p className="mt-2 text-[11px] text-fg-faint">{note}</p>
          ) : null}
          {logPath ? (
            <p className="mt-2 break-all text-[10px] text-fg-faint">{logPath}</p>
          ) : null}

          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-chip bg-bg-deep/60 p-2 text-[10px] leading-relaxed text-fg-faint">
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
