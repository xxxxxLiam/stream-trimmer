/**
 * File: EditorHandoff.tsx
 * Path: src/components/EditorHandoff.tsx
 * Description: Per-campaign "After cutting" setting and the editor handoff
 *   actions (BUILD-SPEC 11c). Off by default and collapsed, so a user who does
 *   not use these editors sees one quiet row.
 *   - Final Cut Pro reads the FCPXML file. Premiere Pro cannot import it
 *     directly (Adobe: needs a third-party converter), so there is no
 *     Premiere action, only the plain export and a one-line note.
 *   - CapCut cannot import project files from other editors, so it gets only a
 *     drop folder, Reveal, Copy file path and Open CapCut. Nothing here implies
 *     a project-level CapCut integration.
 * Contract: controlled (`settings` + `onChange`); the owner persists `settings`
 *   on the campaign. Needs the `editor` bridge from electron/editorOpen.cjs on
 *   window.electronAPI; without it the actions say so instead of failing.
 *   `runAfterCutting` is exported for the cut flow to call once a clip is saved.
 *   No filled-accent button here: the primary action belongs to the screen.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  FRAME_RATE_CHOICES,
  buildSessionFcpxml,
  libraryLocation,
  resolveEventName,
  resolveProjectNames,
  type AfterCutting,
  type FcpxmlProject,
  type TimelineKind,
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
  openWith: (p: { app: "finalcut" | "capcut"; file?: string }) => Promise<Result>;
  /**
   * Whether a directory exists at this absolute path (needs `editor:pathExists`
   * in electron/editorOpen.cjs). Absent bridge method: a library cannot be
   * verified, so a send that names one is refused rather than guessed.
   */
  pathExists?: (target: string) => Promise<{ ok: boolean; exists?: boolean; isDirectory?: boolean; error?: string }>;
  reveal: (target: string) => Promise<Result>;
  copyFiles: (p: { dirPath: string; files: string[] }) => Promise<Result & { copied?: string[]; failed?: string[] }>;
}

function bridge(): EditorBridge | undefined {
  return (window.electronAPI as unknown as { editor?: EditorBridge } | undefined)?.editor;
}

const NEEDS_DESKTOP = "This needs the desktop app.";

// ---------------------------------------------------------------------------
// The project name for the NEXT clip, typed before cutting. It usually comes
// from the user's own notes, so it is a draft kept outside the settings: it is
// used once by the next saved clip and then cleared.
// ---------------------------------------------------------------------------

let nextProjectName = "";
const nameListeners = new Set<() => void>();

export function setNextProjectName(name: string): void {
  nextProjectName = name;
  nameListeners.forEach((l) => l());
}

/** Project names typed for clips already cut, by clip id (this session only). */
const typedProjectNames = new Map<string, string>();

function takeNextProjectName(): string {
  const n = nextProjectName.trim();
  if (nextProjectName) setNextProjectName("");
  return n;
}

function useNextProjectName(): string {
  return useSyncExternalStore(
    (cb) => {
      nameListeners.add(cb);
      return () => nameListeners.delete(cb);
    },
    () => nextProjectName,
  );
}

/** The project block for the document, or undefined when no project is wanted. */
export function projectOptions(
  settings: EditorHandoffSettings,
  ctx: { campaignName?: string; sourceTitle?: string },
): FcpxmlProject | undefined {
  const eventName = settings.projectEvent.trim();
  if (!settings.createProject || !eventName) return undefined;
  return {
    eventName,
    namePattern: settings.projectNamePattern,
    timeline: settings.timelineFormat,
    campaignName: ctx.campaignName,
    sourceTitle: ctx.sourceTitle,
  };
}

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
  openWith?: "finalcut",
  settings?: EditorHandoffSettings,
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
  return exportNamed(api, ctx, eventName, openWith, settings);
}

async function exportNamed(
  api: EditorBridge,
  ctx: HandoffContext,
  eventName: string,
  openWith?: "finalcut",
  settings?: EditorHandoffSettings,
): Promise<HandoffOutcome> {
  const structured = settings;
  const clips = ctx.clips.map((c) =>
    !c.projectName && typedProjectNames.has(c.id) ? { ...c, projectName: typedProjectNames.get(c.id) } : c,
  );
  let built;
  try {
    const library = structured?.fcpLibrary.trim() || undefined;
    if (library) libraryLocation(library); // throws on a relative path before anything runs
    const libraryExists = async (local: string) => {
      if (!api.pathExists) return false;
      const r = await api.pathExists(local);
      return r.ok && r.exists === true && r.isDirectory !== false;
    };
    built = await buildSessionFcpxml(
      clips,
      structured?.mediaEvent.trim() || eventName,
      async (file) => {
        const r = await api.probe(file);
        if (!r.ok) throw new Error(r.error);
        return r;
      },
      { library, libraryExists, project: structured ? projectOptions(structured, ctx) : undefined },
    );
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
  const projects =
    built.projectNames.length > 0
      ? ` and ${built.projectNames.length} ${built.projectNames.length === 1 ? "project" : "projects"}`
      : "";
  if (!openWith) {
    return { ok: true, message: `Saved ${built.filename} with ${count}${projects}.`, skipped: built.skipped, path: written.path };
  }
  const opened = await api.openWith({ app: openWith, file: written.path });
  if (!opened.ok) {
    return { ok: false, message: opened.error ?? "The editor would not open.", skipped: built.skipped, path: written.path };
  }
  return {
    ok: true,
    message: `Saved ${built.filename} with ${count}${projects} and sent it to Final Cut Pro.`,
    skipped: built.skipped,
    path: written.path,
  };
}

// ---------------------------------------------------------------------------
// What the automatic send did, and the session's clips
// ---------------------------------------------------------------------------

/**
 * The outcome of the last automatic "After cutting" action. The cut flow calls
 * `runAfterCutting` without anywhere to put its answer, so the answer is kept
 * here and the panel shows it, the same way it shows its own buttons' results.
 */
let lastAuto: { outcome: HandoffOutcome } | null = null;
const autoListeners = new Set<() => void>();

export function getAfterCuttingOutcome(): { outcome: HandoffOutcome } | null {
  return lastAuto;
}

export function subscribeAfterCutting(l: () => void): () => void {
  autoListeners.add(l);
  return () => {
    autoListeners.delete(l);
  };
}

function publishAuto(outcome: HandoffOutcome | null): void {
  if (!outcome) return;
  lastAuto = { outcome };
  autoListeners.forEach((l) => l());
}

/**
 * Every clip cut this session, per clips folder, newest version of an id wins.
 * Each cut calls `runAfterCutting` with only its own clip; the document for the
 * session has to hold all of them or the next send would replace the file with
 * a one-clip version.
 */
const sessionBatch = new Map<string, SessionClip[]>();

function rememberClips(ctx: HandoffContext): SessionClip[] {
  const key = ctx.clipsDir ?? "";
  const prev = sessionBatch.get(key) ?? [];
  const fresh = new Set(ctx.clips.map((c) => c.id));
  const next = [...prev.filter((c) => !fresh.has(c.id)), ...ctx.clips];
  sessionBatch.set(key, next);
  return next;
}

/** Forget the session's clips and the last automatic outcome (new session; tests). */
export function resetSessionHandoff(): void {
  sessionBatch.clear();
  lastAuto = null;
  autoListeners.forEach((l) => l());
}

/**
 * Run the campaign's "After cutting" choice for the clips just saved. Safe to
 * call when everything is off: it does nothing and returns null. The outcome is
 * also published (see `getAfterCuttingOutcome`) so a failure is never silent,
 * and a thrown error becomes a failed outcome rather than an unhandled one.
 */
export async function runAfterCutting(
  settings: EditorHandoffSettings,
  ctx: HandoffContext,
): Promise<HandoffOutcome | null> {
  const batch = rememberClips(ctx);
  let outcome: HandoffOutcome | null;
  try {
    outcome = await runAfterCuttingInner(settings, ctx, batch);
  } catch (err) {
    outcome = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  publishAuto(outcome);
  return outcome;
}

async function runAfterCuttingInner(
  settings: EditorHandoffSettings,
  ctx: HandoffContext,
  batch: SessionClip[],
): Promise<HandoffOutcome | null> {
  const api = bridge();
  const notes: string[] = [];
  let outcome: HandoffOutcome | null = null;

  // The name typed before this cut belongs to the clip just saved, once. It is
  // remembered by clip id so a later "Send all" still uses it.
  const typed = takeNextProjectName();
  const justSaved = ctx.clips[ctx.clips.length - 1];
  if (typed && justSaved) typedProjectNames.set(justSaved.id, typed);

  if (settings.afterCutting === "reveal") {
    const last = ctx.clips[ctx.clips.length - 1];
    if (api && last) {
      const r = await api.reveal(last.path);
      outcome = { ok: r.ok, message: r.ok ? "Revealed the clip." : r.error ?? "Could not reveal the clip." };
    }
  } else if (settings.afterCutting === "finalcut") {
    if (!api) return { ok: false, message: NEEDS_DESKTOP };
    const eventName = resolveEventName({
      from: settings.eventName,
      campaignName: ctx.campaignName,
      sourceTitle: ctx.sourceTitle,
    });
    outcome = await exportNamed(api, { ...ctx, clips: batch }, eventName, settings.afterCutting, settings);
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

  // The automatic send answers here: show it, and open the panel so a failure is seen.
  const auto = useSyncExternalStore(subscribeAfterCutting, getAfterCuttingOutcome, getAfterCuttingOutcome);
  useEffect(() => {
    if (!auto) return;
    setStatus(auto.outcome);
    if (!auto.outcome.ok) setOpen(true);
  }, [auto]);

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
  const nextName = useNextProjectName();
  const projectOn = settings.createProject && settings.projectEvent.trim() !== "";
  const libraryText = settings.fcpLibrary.trim();
  let libraryProblem = "";
  if (libraryText) {
    try {
      libraryLocation(libraryText);
      if (!/\.fcpbundle\/?$/i.test(libraryText)) libraryProblem = "This does not end in .fcpbundle. Check it points at the library itself.";
    } catch {
      libraryProblem = "Use the full path of the library, starting with /.";
    }
  }
  const previewNames = projectOn
    ? resolveProjectNames(clips.slice(-3), {
        namePattern: settings.projectNamePattern,
        campaignName,
        sourceTitle,
      })
    : [];
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
                </option>
              ))}
            </select>
          </label>

          {settings.afterCutting === "finalcut" && (
            <p className="t-meta m-0">
              {settings.fcpLibrary.trim()
                ? "Final Cut is told which library to use (set below). "
                : "No library is set, so Final Cut uses its own default. With several libraries open, set one below. "}
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

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <h3 className="text-body m-0">Final Cut Pro library and events</h3>
            <label className="flex flex-col gap-1">
              <span className="text-body">Library</span>
              <div className="flex items-center gap-2">
                <input
                  className="field min-w-0 flex-1"
                  dir="auto"
                  placeholder="/Users/you/Movies/Client.fcpbundle"
                  value={settings.fcpLibrary}
                  onChange={(e) => set({ fcpLibrary: e.target.value })}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const dir = await window.electronAPI?.pickDirectory?.();
                    if (dir) set({ fcpLibrary: dir });
                  }}
                >
                  Choose
                </button>
              </div>
              <span className={libraryProblem ? "text-body" : "t-meta"} role={libraryProblem ? "alert" : undefined}>
                {libraryProblem ||
                  (libraryText
                    ? "The import is aimed at this library, whichever one is active. It must already exist: if nothing is there, Final Cut would make a new library, so the send is refused."
                    : "Blank means Final Cut picks the library. Set this if you keep several open.")}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-body">Event for the raw clip</span>
              <input
                className="field"
                dir="auto"
                placeholder={eventName}
                value={settings.mediaEvent}
                onChange={(e) => set({ mediaEvent: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={settings.createProject}
                onChange={(e) => set({ createProject: e.target.checked })}
              />
              Also create a project with the clip on its timeline
            </label>
            {settings.createProject && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-body">Event for the projects</span>
                  <input
                    className="field"
                    dir="auto"
                    value={settings.projectEvent}
                    onChange={(e) => set({ projectEvent: e.target.value })}
                  />
                  {!settings.projectEvent.trim() && (
                    <span className="t-meta">Blank means no project is created.</span>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body">Project name</span>
                  <input
                    className="field"
                    dir="auto"
                    value={settings.projectNamePattern}
                    onChange={(e) => set({ projectNamePattern: e.target.value })}
                  />
                  <span className="t-meta">
                    Use {"{clipId}"}, {"{label}"}, {"{campaign}"} and {"{source}"}.
                    {previewNames.length > 0 ? ` Now: ${previewNames.join(", ")}` : ""}
                  </span>
                  <span className="t-meta">
                    A project name that already exists in Final Cut makes it ask whether to replace or keep both, for the whole import.
                    {settings.projectNamePattern.trim() && !settings.projectNamePattern.includes("{clipId}")
                      ? " Add {clipId} to the name so every project is unique."
                      : ""}
                  </span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body">Name for the next clip</span>
                  <input
                    className="field"
                    dir="auto"
                    placeholder="Leave blank to use the pattern"
                    value={nextName}
                    onChange={(e) => setNextProjectName(e.target.value)}
                  />
                  <span className="t-meta">Type it before you cut. It applies to that clip only.</span>
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-body">Timeline</span>
                    <select
                      className="field"
                      value={settings.timelineFormat.kind}
                      onChange={(e) => {
                        const kind = e.target.value as TimelineKind;
                        const fps = kind !== "source" && settings.timelineFormat.fps === "source" ? "30" : settings.timelineFormat.fps;
                        set({ timelineFormat: { ...settings.timelineFormat, kind, fps } });
                      }}
                    >
                      <option value="vertical">Vertical 1080 x 1920</option>
                      <option value="source">Match source</option>
                      <option value="custom">Custom size</option>
                    </select>
                  </label>
                  {settings.timelineFormat.kind === "custom" && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-body">Width</span>
                        <input
                          className="field w-24"
                          inputMode="numeric"
                          value={settings.timelineFormat.width}
                          onChange={(e) => set({ timelineFormat: { ...settings.timelineFormat, width: Number(e.target.value.replace(/\D/g, "")) } })}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-body">Height</span>
                        <input
                          className="field w-24"
                          inputMode="numeric"
                          value={settings.timelineFormat.height}
                          onChange={(e) => set({ timelineFormat: { ...settings.timelineFormat, height: Number(e.target.value.replace(/\D/g, "")) } })}
                        />
                      </label>
                    </>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-body">Frame rate</span>
                    <select
                      className="field"
                      value={settings.timelineFormat.fps}
                      onChange={(e) => set({ timelineFormat: { ...settings.timelineFormat, fps: e.target.value } })}
                    >
                      {settings.timelineFormat.kind === "source" && <option value="source">Same as source</option>}
                      {FRAME_RATE_CHOICES.map((r) => (
                        <option key={r} value={r}>
                          {r} fps
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <span className="t-meta">
                  The timeline never copies the source unless you choose Match source.
                </span>
              </>
            )}
          </div>

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
                  return exportNamed(api, ctx, eventName, undefined, settings);
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
            <button type="button" className="btn" disabled={!hasClips} title={noClipsReason} onClick={() => void copyPaths()}>
              Copy file path
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void reveal(clipsDir, "a clips folder")}>
              Reveal in Finder
            </button>
          </div>
          <p className="t-meta m-0">
            Premiere Pro cannot open this file without a third-party converter.
          </p>
          <p className="t-meta m-0">
            Send all puts every clip from this session into one file
            {hasClips ? ` (${clips.length})` : ""}{projectOn ? ", each with its own project" : ""}.
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

  function runSend(app: "finalcut"): Promise<HandoffOutcome> {
    const api = bridge();
    if (!api) return Promise.resolve({ ok: false, message: NEEDS_DESKTOP });
    return exportNamed(api, ctx, eventName, app, settings);
  }
}
