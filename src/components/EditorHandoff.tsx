/**
 * File: EditorHandoff.tsx
 * Path: src/components/EditorHandoff.tsx
 * Description: Per-campaign "After cutting" setting and the editor handoff
 *   actions (BUILD-SPEC 11c). Off by default and collapsed, so a user who does
 *   not use these editors sees one quiet row.
 *   - Final Cut Pro and Premiere Pro both read the same FCPXML file.
 *   - CapCut cannot import project files from other editors, so it gets only a
 *     drop folder, Reveal, Copy file path and Open CapCut. Nothing here implies
 *     a project-level CapCut integration.
 * Contract: controlled (`settings` + `onChange`); the owner persists `settings`
 *   on the campaign. Needs the `editor` bridge from electron/editorOpen.cjs on
 *   window.electronAPI; without it the actions say so instead of failing.
 *   `runAfterCutting` is exported for the cut flow to call once a clip is saved.
 *   No filled-accent button here: the primary action belongs to the screen.
 */
import { useEffect, useState } from "react";
import {
  buildSessionFcpxml,
  resolveEventName,
  type AfterCutting,
  type EditorHandoffSettings,
  type RawProbe,
  type SessionClip,
} from "../lib/fcpxml";
import { writeClipboard } from "../lib/handoff";

type Result = { ok: boolean; error?: string; missing?: string; path?: string };

/** The renderer side of electron/editorOpen.cjs (exposed by the preload). */
export interface EditorBridge {
  installed: () => Promise<{ ok: boolean; apps?: { finalcut: boolean; premiere: boolean; capcut: boolean } }>;
  probe: (file: string) => Promise<({ ok: true } & RawProbe) | { ok: false; error: string }>;
  writeFcpxml: (p: { dirPath: string; filename: string; contents: string }) => Promise<Result>;
  openWith: (p: { app: "finalcut" | "premiere" | "capcut"; file?: string }) => Promise<Result>;
  reveal: (target: string) => Promise<Result>;
  copyFiles: (p: { dirPath: string; files: string[] }) => Promise<Result & { copied?: string[]; failed?: string[] }>;
}

function bridge(): EditorBridge | undefined {
  return (window.electronAPI as unknown as { editor?: EditorBridge } | undefined)?.editor;
}

const NEEDS_DESKTOP = "This needs the desktop app.";

export interface HandoffContext {
  campaignName?: string;
  sourceTitle?: string;
  /** Folder the .fcpxml is written to: the campaign's clips folder. */
  clipsDir?: string;
  clips: SessionClip[];
}

export interface HandoffOutcome {
  ok: boolean;
  message: string;
  /** Clips left out of the file, with the reason each. */
  skipped?: { id: string; reason: string }[];
  path?: string;
}

/** Probe, build ONE document for `ctx.clips`, write it, optionally open it. */
export async function exportFcpxml(
  ctx: HandoffContext,
  openWith?: "finalcut" | "premiere",
): Promise<HandoffOutcome> {
  const api = bridge();
  if (!api) return { ok: false, message: NEEDS_DESKTOP };
  if (!ctx.clipsDir) {
    return { ok: false, message: "Choose a clips folder first. The editor file is saved there." };
  }
  if (ctx.clips.length === 0) {
    return { ok: false, message: "No clips yet. Cut one, then send it." };
  }
  const eventName = resolveEventName({
    from: "campaign",
    campaignName: ctx.campaignName,
    sourceTitle: ctx.sourceTitle,
  });
  return exportNamed(api, ctx, eventName, openWith);
}

async function exportNamed(
  api: EditorBridge,
  ctx: HandoffContext,
  eventName: string,
  openWith?: "finalcut" | "premiere",
): Promise<HandoffOutcome> {
  let built;
  try {
    built = await buildSessionFcpxml(ctx.clips, eventName, async (file) => {
      const r = await api.probe(file);
      if (!r.ok) throw new Error(r.error);
      return r;
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const written = await api.writeFcpxml({
    dirPath: ctx.clipsDir as string,
    filename: built.filename,
    contents: built.xml,
  });
  if (!written.ok || !written.path) {
    return { ok: false, message: written.error ?? "The editor file could not be saved.", skipped: built.skipped };
  }
  const count = `${built.included} ${built.included === 1 ? "clip" : "clips"}`;
  if (!openWith) {
    return { ok: true, message: `Saved ${built.filename} with ${count}.`, skipped: built.skipped, path: written.path };
  }
  const opened = await api.openWith({ app: openWith, file: written.path });
  if (!opened.ok) {
    return { ok: false, message: opened.error ?? "The editor would not open.", skipped: built.skipped, path: written.path };
  }
  return {
    ok: true,
    message: `Saved ${built.filename} with ${count} and sent it to ${openWith === "finalcut" ? "Final Cut Pro" : "Premiere Pro"}.`,
    skipped: built.skipped,
    path: written.path,
  };
}

/**
 * Run the campaign's "After cutting" choice for the clips just saved. Safe to
 * call when everything is off: it does nothing and returns null.
 */
export async function runAfterCutting(
  settings: EditorHandoffSettings,
  ctx: HandoffContext,
): Promise<HandoffOutcome | null> {
  const api = bridge();
  const notes: string[] = [];
  let outcome: HandoffOutcome | null = null;

  if (settings.afterCutting === "reveal") {
    const last = ctx.clips[ctx.clips.length - 1];
    if (api && last) {
      const r = await api.reveal(last.path);
      outcome = { ok: r.ok, message: r.ok ? "Revealed the clip." : r.error ?? "Could not reveal the clip." };
    }
  } else if (settings.afterCutting === "finalcut" || settings.afterCutting === "premiere") {
    if (!api) return { ok: false, message: NEEDS_DESKTOP };
    const eventName = resolveEventName({
      from: settings.eventName,
      campaignName: ctx.campaignName,
      sourceTitle: ctx.sourceTitle,
    });
    outcome = await exportNamed(api, ctx, eventName, settings.afterCutting);
  }

  if (api && settings.capcutDropDir && ctx.clips.length > 0) {
    const r = await api.copyFiles({ dirPath: settings.capcutDropDir, files: ctx.clips.map((c) => c.path) });
    notes.push(r.ok ? "Copied to the CapCut folder." : r.error ?? "Could not copy to the CapCut folder.");
  }
  if (api && settings.openCapCut) {
    const r = await api.openWith({ app: "capcut" });
    if (!r.ok) notes.push(r.error ?? "CapCut would not open.");
  }
  if (notes.length === 0) return outcome;
  const base = outcome ?? { ok: true, message: "" };
  return { ...base, message: [base.message, ...notes].filter(Boolean).join(" ") };
}

// ---------------------------------------------------------------------------

export type EditorHandoffProps = {
  settings: EditorHandoffSettings;
  onChange: (next: EditorHandoffSettings) => void;
  campaignName?: string;
  sourceTitle?: string;
  clipsDir?: string;
  /** Every finished clip from this session, in the order they were cut. */
  clips: SessionClip[];
};

const OPTIONS: { value: AfterCutting; label: string }[] = [
  { value: "nothing", label: "Nothing" },
  { value: "reveal", label: "Reveal in Finder" },
  { value: "finalcut", label: "Send to Final Cut Pro" },
  { value: "premiere", label: "Send to Premiere Pro" },
];

export default function EditorHandoff({
  settings,
  onChange,
  campaignName,
  sourceTitle,
  clipsDir,
  clips,
}: EditorHandoffProps) {
  const [open, setOpen] = useState(settings.afterCutting !== "nothing" || !!settings.capcutDropDir);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<HandoffOutcome | null>(null);
  const [apps, setApps] = useState<{ finalcut: boolean; premiere: boolean; capcut: boolean } | null>(null);
  const set = (patch: Partial<EditorHandoffSettings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void bridge()?.installed().then((r) => alive && r.ok && r.apps && setApps(r.apps)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const ctx: HandoffContext = { campaignName, sourceTitle, clipsDir, clips };
  const eventName = resolveEventName({ from: settings.eventName, campaignName, sourceTitle });
  const hasClips = clips.length > 0;
  const noClipsReason = hasClips ? undefined : "No clips yet";

  const run = async (job: () => Promise<HandoffOutcome | null>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await job());
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const copyPaths = async () => {
    const r = await writeClipboard(clips.map((c) => c.path).join("\n"));
    setStatus(
      r.ok
        ? { ok: true, message: `Copied ${clips.length} file ${clips.length === 1 ? "path" : "paths"}.` }
        : { ok: false, message: r.error },
    );
  };

  const reveal = (target: string | undefined, what: string) =>
    run(async () => {
      const api = bridge();
      if (!api) return { ok: false, message: NEEDS_DESKTOP };
      if (!target) return { ok: false, message: `Choose ${what} first.` };
      const r = await api.reveal(target);
      return { ok: r.ok, message: r.ok ? "" : r.error ?? "Could not open that folder." };
    });

  const pickDrop = async () => {
    const dir = await window.electronAPI?.pickDirectory?.();
    if (dir) set({ capcutDropDir: dir });
  };

  const summary = OPTIONS.find((o) => o.value === settings.afterCutting)?.label ?? "Nothing";

  return (
    <section className="flex flex-col gap-2" aria-label="Editor handoff">
      <button
        type="button"
        className="btn justify-between"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Hand off to an editor</span>
        <span className="text-meta text-fg-dim">After cutting: {summary}</span>
      </button>

      {open && (
        <div className="surface-raised flex flex-col gap-3 rounded-control border border-hairline p-3">
          <label className="flex flex-col gap-1">
            <span className="text-body">After cutting</span>
            <select
              className="field"
              value={settings.afterCutting}
              onChange={(e) => set({ afterCutting: e.target.value as AfterCutting })}
            >
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {apps && o.value === "finalcut" && !apps.finalcut ? " (not found)" : ""}
                  {apps && o.value === "premiere" && !apps.premiere ? " (not found)" : ""}
                </option>
              ))}
            </select>
          </label>

          {(settings.afterCutting === "finalcut" || settings.afterCutting === "premiere") && (
            <p className="t-meta m-0">
              {settings.afterCutting === "premiere"
                ? "Premiere reads the same file. Clip names and media links come across; the notes with the source link and timecodes may not show. "
                : "Final Cut places the event in the library that is open. "}
              DaVinci Resolve reads this file too.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-body">Event name</span>
            <select
              className="field"
              value={settings.eventName}
              onChange={(e) => set({ eventName: e.target.value === "source" ? "source" : "campaign" })}
            >
              <option value="campaign">Campaign name</option>
              <option value="source">Source title</option>
            </select>
            <span className="t-meta" dir="auto">{eventName}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy || !hasClips}
              title={noClipsReason}
              onClick={() =>
                void run(async () => {
                  const api = bridge();
                  if (!api) return { ok: false, message: NEEDS_DESKTOP };
                  return exportNamed(api, ctx, eventName);
                })
              }
            >
              Export FCPXML
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !hasClips}
              title={noClipsReason}
              onClick={() => void run(() => runSend("finalcut"))}
            >
              Send all to Final Cut Pro
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !hasClips}
              title={noClipsReason}
              onClick={() => void run(() => runSend("premiere"))}
            >
              Send all to Premiere Pro
            </button>
            <button type="button" className="btn" disabled={!hasClips} title={noClipsReason} onClick={() => void copyPaths()}>
              Copy file path
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void reveal(clipsDir, "a clips folder")}>
              Reveal in Finder
            </button>
          </div>
          <p className="t-meta m-0">
            Send all puts every clip from this session into one event
            {hasClips ? ` (${clips.length})` : ""}.
          </p>

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <h3 className="text-body m-0">CapCut</h3>
            <p className="t-meta m-0">
              CapCut cannot import project files from other editors. Cut clips can be copied into a
              folder you then add in CapCut's media panel.
            </p>
            <div className="flex items-center gap-2">
              <span className="t-meta min-w-0 flex-1 truncate" dir="auto" title={settings.capcutDropDir}>
                {settings.capcutDropDir || "No drop folder"}
              </span>
              <button type="button" className="btn" onClick={() => void pickDrop()}>
                Choose
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                disabled={busy || !settings.capcutDropDir}
                onClick={() => void reveal(settings.capcutDropDir, "a drop folder")}
              >
                Reveal drop folder
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                title={apps && !apps.capcut ? "CapCut was not found" : undefined}
                onClick={() =>
                  void run(async () => {
                    const api = bridge();
                    if (!api) return { ok: false, message: NEEDS_DESKTOP };
                    const r = await api.openWith({ app: "capcut" });
                    return { ok: r.ok, message: r.ok ? "" : r.error ?? "CapCut would not open." };
                  })
                }
              >
                Open CapCut
              </button>
            </div>
            <label className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={settings.openCapCut}
                onChange={(e) => set({ openCapCut: e.target.checked })}
              />
              Open CapCut after cutting
            </label>
          </div>

          {status && (status.message || status.skipped?.length) && (
            <div role={status.ok ? "status" : "alert"} className={status.ok ? "t-meta" : "card-alert px-3 py-2 text-body"}>
              {status.message}
              {status.skipped && status.skipped.length > 0 && (
                <ul className="m-0 mt-1 list-none p-0">
                  {status.skipped.map((s) => (
                    <li key={s.id}>
                      Left out {s.id}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );

  function runSend(app: "finalcut" | "premiere"): Promise<HandoffOutcome> {
    const api = bridge();
    if (!api) return Promise.resolve({ ok: false, message: NEEDS_DESKTOP });
    return exportNamed(api, ctx, eventName, app);
  }
}
