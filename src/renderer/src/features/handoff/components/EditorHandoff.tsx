/**
 * File: EditorHandoff.tsx
 * Path: src/renderer/src/features/handoff/components/EditorHandoff.tsx
 * Description: Per-campaign "After cutting" setting and the editor handoff
 *   actions (BUILD-SPEC 11c). Off by default and collapsed, so a user who does
 *   not use these editors sees one quiet row.
 *   - Final Cut Pro reads the FCPXML file. Premiere Pro cannot import it
 *     directly (Adobe: needs a third-party converter), so there is no
 *     Premiere action, only the plain export and a one-line note.
 *   - CapCut cannot import project files from other editors, so it gets only a
 *     drop folder, Reveal, Copy file path and Open CapCut. Nothing here implies
 *     a project-level CapCut integration.
 * Layout: the dialog shows the one choice that matters (After cutting), what is
 *   ready to send, and the actions. Everything else (library, project naming,
 *   my look, CapCut) sits in collapsed rows that each show their current value,
 *   one open at a time, so the dialog rarely needs to scroll.
 * Contract: controlled (`settings` + `onChange`); the owner persists `settings`
 *   on the campaign. Needs the `editor` bridge from electron/editorOpen.ts on
 *   window.electronAPI; without it the actions say so instead of failing.
 *   `runAfterCutting` is exported for the cut flow to call once a clip is saved.
 *   No filled-accent button here: the primary action belongs to the screen.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  FRAME_RATE_CHOICES,
  buildSessionFcpxml,
  libraryLocation,
  importLayout,
  resolveProjectNames,
  type AfterCutting,
  type FcpxmlProject,
  type TimelineKind,
  type EditorHandoffSettings,
  type RawProbe,
  type SessionClip,
} from "../../../shared/utils/fcpxml";
import { writeClipboard } from "../../../shared/utils/handoff";
import { parseLook } from "../../../../../common/utils/fcpLook";
import { normalizeCampaigns } from "../../../shared/utils/campaigns";
import { KEY_LOOK_MIGRATED, loadSavedLooks, lookForCampaign } from "../../../shared/utils/fcpLooks";
import { readSetting } from "../../../shared/utils/persist";

type Result = { ok: boolean; error?: string; missing?: string; path?: string };

/** The renderer side of electron/editorOpen.ts (exposed by the preload). */
export interface EditorBridge {
  installed: () => Promise<{ ok: boolean; apps?: { finalcut: boolean; premiere: boolean; capcut: boolean } }>;
  probe: (file: string) => Promise<({ ok: true } & RawProbe) | { ok: false; error: string }>;
  writeFcpxml: (p: { dirPath: string; filename: string; contents: string }) => Promise<Result>;
  openWith: (p: { app: "finalcut" | "premiere" | "resolve" | "capcut"; file?: string }) => Promise<Result & { shown?: boolean }>;
  /**
   * Whether a directory exists at this absolute path (needs `editor:pathExists`
   * in electron/editorOpen.ts). Absent bridge method: a library cannot be
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
  ctx: { campaignId?: string | null; campaignName?: string; sourceTitle?: string },
): FcpxmlProject | undefined {
  const { eventName } = importLayout(settings, ctx);
  if (!eventName) return undefined;
  return {
    eventName,
    namePattern: settings.projectNamePattern,
    timeline: settings.timelineFormat,
    campaignName: ctx.campaignName,
    sourceTitle: ctx.sourceTitle,
    // The campaign's saved look (see fcpLooks.ts). The caller's try/catch turns a plain-words
    // error into a failed outcome.
    ...(lookForCampaignId(ctx.campaignId, settings) ? { look: lookForCampaignId(ctx.campaignId, settings) } : {}),
  };
}

function lookForCampaignId(campaignId: string | null | undefined, settings: EditorHandoffSettings) {
  const campaign = normalizeCampaigns(readSetting<unknown>("clipper.campaigns", [])).find((c) => c.id === campaignId);
  // A look picked in the form always wins; the migration flag never gates it. Only a campaign with no look of its
  // own, before the one-time move, still uses the old single pasted look (a look that cannot be read throws its
  // plain-words error).
  if (!campaign?.fcpLookId && !readSetting<boolean>(KEY_LOOK_MIGRATED, false)) {
    return settings.applyLook && settings.lookXml ? parseLook(settings.lookXml) : undefined;
  }
  return lookForCampaign(campaign, loadSavedLooks());
}

export interface HandoffContext {
  /**
   * The campaign these clips were cut under. Required, because the session batch is scoped to it:
   * a clip cut for one campaign must never appear in another campaign's document.
   */
  campaignId: string | null;
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
  /** The clip this send was for, so a failure can be shown on that clip's Export row. */
  clipId?: string;
  clipPath?: string;
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
  const { eventName } = importLayout(settings ?? {}, ctx);
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
  // With a layout, the campaign's own Event field names the event ("Export" when blank). The video
  // being open must not decide it: clips from other videos would land under this one.
  const layout = structured?.layout;
  const campaignEvent = layout ? structured?.mediaEvent ?? "" : eventName;
  // Without a layout, each clip carries the keyword the old layout gives its source video.
  const keyword = layout ? "" : importLayout(structured ?? {}, ctx).keyword;
  const clips = ctx.clips.map((c) => {
    const withTitle = layout ? { ...c, sourceTitle: c.sourceTitle ?? ctx.sourceTitle } : { ...c, keyword: c.keyword ?? keyword };
    return typedProjectNames.has(c.id) ? { ...withTitle, projectName: typedProjectNames.get(c.id) } : withTitle;
  });
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
      campaignEvent,
      async (file) => {
        const r = await api.probe(file);
        if (!r.ok) throw new Error(r.error);
        return r;
      },
      { library, libraryExists, layout, project: structured ? projectOptions(structured, ctx) : undefined },
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
    return { ok: true, message: `Saved ${written.path.split(/[\\/]/).pop() ?? built.filename} with ${count}${projects}.`, skipped: built.skipped, path: written.path };
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
export type AfterCuttingAnswer = {
  outcome: HandoffOutcome;
  campaignId: string | null;
  /** What it ran with, so "Send to another editor" can send the same clip again. */
  ctx: HandoffContext;
  settings: EditorHandoffSettings;
};
let lastAuto: AfterCuttingAnswer | null = null;
const autoListeners = new Set<() => void>();
export function getAfterCuttingOutcome(): AfterCuttingAnswer | null {
  return lastAuto;
}
export function subscribeAfterCutting(l: () => void): () => void {
  autoListeners.add(l);
  return () => {
    autoListeners.delete(l);
  };
}
function publishAuto(outcome: HandoffOutcome | null, ctx: HandoffContext, settings: EditorHandoffSettings): void {
  if (!outcome) return;
  const last = ctx.clips[ctx.clips.length - 1];
  lastAuto = {
    outcome: { ...outcome, clipId: outcome.clipId ?? last?.id, clipPath: outcome.clipPath ?? last?.path },
    campaignId: ctx.campaignId,
    ctx,
    settings,
  };
  autoListeners.forEach((l) => l());
}

/** The Export row has shown the answer (or a new clip started): forget it. */
export function clearAfterCuttingOutcome(): void {
  if (!lastAuto) return;
  lastAuto = null;
  autoListeners.forEach((l) => l());
}

/** Forget every campaign's session clips and the last automatic outcome (tests; nothing in the app needs it). */
export function resetSessionHandoff(): void {
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
  let outcome: HandoffOutcome | null;
  try {
    outcome = await runAfterCuttingInner(settings, ctx);
  } catch (err) {
    outcome = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  publishAuto(outcome, ctx, settings);
  return outcome;
}

async function runAfterCuttingInner(
  settings: EditorHandoffSettings,
  ctx: HandoffContext,
): Promise<HandoffOutcome | null> {
  const api = bridge();
  const notes: string[] = [];
  let outcome: HandoffOutcome | null = null;
  // The name typed before this cut belongs to the clip just saved, once. It is
  // remembered by clip id so a later "Send all" still uses it.
  const typed = takeNextProjectName();
  // A clip and its language copies arrive together: the editor opens with the clip itself, not a dub.
  const justSaved = ctx.clips.find((c) => !c.parentId) ?? ctx.clips[ctx.clips.length - 1];
  if (typed && justSaved) typedProjectNames.set(justSaved.id, typed);
  if (settings.afterCutting === "reveal") {
    const last = ctx.clips.find((c) => !c.parentId) ?? ctx.clips[ctx.clips.length - 1];
    if (api && last) {
      const r = await api.reveal(last.path);
      outcome = { ok: r.ok, message: r.ok ? "Revealed the clip." : r.error ?? "Could not reveal the clip." };
    }
  } else if (settings.afterCutting === "finalcut") {
    if (!api) return { ok: false, message: NEEDS_DESKTOP };
    const { eventName } = importLayout(settings, ctx);
    outcome = await exportNamed(api, ctx, eventName, settings.afterCutting, settings);
  }
  if (api && settings.openIn && justSaved) {
    // The editor chosen in the Clip menu opens with the saved clip; where it can't take it, the
    // file is shown in the folder instead.
    const r = await api.openWith({ app: settings.openIn, file: justSaved.path });
    outcome = { ok: r.ok, message: r.ok ? (r.shown ? "Opened the editor and showed the clip." : "Opened the editor.") : r.error ?? "The editor would not open." };
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
// Panel
// ---------------------------------------------------------------------------
export type EditorHandoffProps = {
  settings: EditorHandoffSettings;
  onChange: (next: EditorHandoffSettings) => void;
  /** The active campaign. The clips below are this campaign's alone, and so is the status shown. */
  campaignId: string | null;
  campaignName?: string;
  sourceTitle?: string;
  clipsDir?: string;
  /** Every finished clip from this session for THIS campaign, in the order they were cut. */
  clips: SessionClip[];
  /** Any campaign's settings, for a clip of another campaign sent from History. */
  settingsFor?: (campaignId: string) => EditorHandoffSettings;
};

const OPTIONS: { value: AfterCutting; label: string }[] = [
  { value: "nothing", label: "Nothing" },
  { value: "reveal", label: "Reveal in Finder" },
  { value: "finalcut", label: "Send to Final Cut Pro" },
];

type SectionId = "library" | "projects" | "capcut";

/** Last path segment, for a one-line summary of a long path. */
function baseName(path: string): string {
  const last = path.replace(/\/+$/, "").split("/").pop() ?? path;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * One collapsed row: the title on the left and the current value on the right,
 * so every setting can be checked without opening it.
 */
function Section(props: {
  panelId: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { panelId, title, summary, open, onToggle, children } = props;
  return (
    <div className="flex flex-col border-t border-hairline">
      <button
        type="button"
        className="link-quiet w-full justify-between gap-3"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="text-fg">{title}</span>
        <span className="t-meta min-w-0 flex-1 truncate text-right" dir="auto">
          {summary}
        </span>
        <span aria-hidden="true" className={`text-fg-dim transition-transform ${open ? "rotate-90" : ""}`}>
          &rsaquo;
        </span>
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3 px-2 pb-4 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function EditorHandoff({
  settings,
  onChange,
  campaignId,
  campaignName,
  sourceTitle,
  clipsDir,
  clips,
}: EditorHandoffProps) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId | null>(null);
  const titleId = useId();
  const readyId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<HandoffOutcome | null>(null);
  const [apps, setApps] = useState<{ finalcut: boolean; premiere: boolean; capcut: boolean } | null>(null);
  const set = (patch: Partial<EditorHandoffSettings>) => onChange({ ...settings, ...patch });
  const toggle = (id: SectionId) => setSection((s) => (s === id ? null : id));
  // Escape closes the dialog before anything behind it sees the key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  // The automatic send answers here: show it, and open the panel so a failure is seen.
  // It is shown only under the campaign it ran for: another client's "Saved X.fcpxml with 2 clips"
  // is not this campaign's status, and neither is a button result left from before the switch.
  const autoAny = useSyncExternalStore(subscribeAfterCutting, getAfterCuttingOutcome, getAfterCuttingOutcome);
  const auto = autoAny && autoAny.campaignId === campaignId ? autoAny : null;
  useEffect(() => {
    setStatus(null);
  }, [campaignId]);
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
  const ctx: HandoffContext = { campaignId, campaignName, sourceTitle, clipsDir, clips };
  const { eventName } = importLayout(settings, { campaignName, sourceTitle });
  const nextName = useNextProjectName();
  const libraryText = settings.fcpLibrary.trim();
  let libraryProblem = "";
  if (libraryText) {
    try {
      libraryLocation(libraryText);
      if (!/\.fcpbundle\/?$/i.test(libraryText)) libraryProblem = "The library path does not end in .fcpbundle. Check it points at the library itself.";
    } catch {
      libraryProblem = "The library path must be the full path, starting with /.";
    }
  }
  const problems = [libraryProblem].filter(Boolean);
  const previewNames = resolveProjectNames(clips.slice(-3), {
    namePattern: settings.projectNamePattern,
    campaignName,
    sourceTitle,
  });
  const hasClips = clips.length > 0;
  // A send that finishes after the campaign changed answers for the old campaign: drop its message.
  const liveCampaign = useRef(campaignId);
  liveCampaign.current = campaignId;
  const run = async (job: () => Promise<HandoffOutcome | null>) => {
    const startedFor = campaignId;
    const answer = (o: HandoffOutcome | null) => {
      if (liveCampaign.current === startedFor) setStatus(o);
    };
    setBusy(true);
    setStatus(null);
    try {
      answer(await job());
    } catch (err) {
      answer({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  const copyPaths = async () => {
    const startedFor = campaignId;
    const r = await writeClipboard(clips.map((c) => c.path).join("\n"));
    if (liveCampaign.current !== startedFor) return;
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
  const modeNote =
    settings.afterCutting === "finalcut"
      ? libraryText
        ? `Every cut goes to Final Cut in ${baseName(libraryText)}.`
        : "Every cut goes to Final Cut, which picks its own library. Set one under Library if you keep several open."
      : settings.afterCutting === "reveal"
        ? "Finder shows each clip as soon as it is cut."
        : "Clips stay in the clips folder until you send them.";
  const projectsSummary = `${settings.projectNamePattern.trim() || "{clipId} {label}"} \u00B7 ${
    settings.timelineFormat.kind === "vertical"
      ? "Vertical 1080 x 1920"
      : settings.timelineFormat.kind === "source"
        ? "Match source"
        : settings.timelineFormat.kind === "look"
          ? "From your look"
        : `${settings.timelineFormat.width} x ${settings.timelineFormat.height}`
  } \u00B7 ${settings.timelineFormat.fps === "source" ? "source fps" : `${settings.timelineFormat.fps} fps`}`;
  const showStatus = !busy && !!status && (!!status.message || (status.skipped?.length ?? 0) > 0);
  const savedPath = status?.ok ? status.path : undefined;
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="surface-panel fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100%_-_32px)] w-[min(560px,calc(100%_-_32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-panel border border-hairline p-6 shadow-[0_0_0_9999px_var(--bg-overlay-60)]"
        >
          <div className="flex items-center gap-3">
            <h2 id={titleId} className="text-section m-0 min-w-0 flex-1 font-medium text-fg">
              Hand off to an editor
            </h2>
            <button type="button" className="chip shrink-0" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          {/* The one choice that matters, all options visible at once. */}
          <div className="flex flex-col gap-2">
            <span className="text-body text-fg">After cutting</span>
            <div role="group" aria-label="After cutting" className="flex gap-2">
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="btn min-w-0 flex-1 px-2"
                  aria-pressed={settings.afterCutting === o.value}
                  onClick={() => set({ afterCutting: o.value })}
                >
                  <span className="truncate">
                    {o.label}
                    {apps && o.value === "finalcut" && !apps.finalcut ? " (not found)" : ""}
                  </span>
                </button>
              ))}
            </div>
            <p className="t-meta m-0">{modeNote}</p>
          </div>
          {/* What is ready, then what to do with it. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p id={readyId} className="t-meta m-0 flex items-center gap-2">
                <span className={`dot ${hasClips ? "dot-saved" : "dot-queued"}`} aria-hidden="true" />
                {hasClips
                  ? `${clips.length} ${clips.length === 1 ? "clip" : "clips"} ready from this session`
                  : "No clips yet. Cut one and the buttons below turn on."}
              </p>
              <p className="t-meta m-0" dir="auto">
                Event: {eventName}. Raw clips are tagged Raw and each project sits next to them.
              </p>
            </div>
            {problems.map((p) => (
              <div key={p} role="alert" className="card-alert px-3 py-2 text-body">
                {p}
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn w-full"
                disabled={busy || !hasClips}
                aria-describedby={hasClips ? undefined : readyId}
                onClick={() => void run(() => runSend("finalcut"))}
              >
                Send all to Final Cut Pro
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="chip"
                  disabled={busy || !hasClips}
                  aria-describedby={hasClips ? undefined : readyId}
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
                  className="chip"
                  disabled={!hasClips}
                  aria-describedby={hasClips ? undefined : readyId}
                  onClick={() => void copyPaths()}
                >
                  Copy file path
                </button>
                <button type="button" className="chip" disabled={busy} onClick={() => void reveal(clipsDir, "a clips folder")}>
                  Reveal in Finder
                </button>
              </div>
            </div>
            {busy && (
              <p role="status" className="t-meta m-0 flex items-center gap-2">
                <span className="dot dot-cutting" aria-hidden="true" />
                Working on it. This can take a few seconds.
              </p>
            )}
            {showStatus && status && (
              <div role={status.ok ? "status" : "alert"} className={status.ok ? "flex flex-col gap-2" : "card-alert flex flex-col gap-2 px-3 py-2 text-body"}>
                {status.message && <p className={status.ok ? "t-meta m-0" : "m-0"}>{status.message}</p>}
                {status.skipped && status.skipped.length > 0 && (
                  <ul className="m-0 list-none p-0">
                    {status.skipped.map((s) => (
                      <li key={s.id}>
                        Left out {s.id}: {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {savedPath && (
                  <div>
                    <button type="button" className="chip" onClick={() => void bridge()?.reveal(savedPath)}>
                      Show file in Finder
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Everything else: closed by default, current value always visible. */}
          <div className="flex flex-col">
            <Section
              panelId={`${titleId}-library`}
              title="Library"
              summary={libraryText ? baseName(libraryText) : "Final Cut picks"}
              open={section === "library"}
              onToggle={() => toggle("library")}
            >
              <label className="flex flex-col gap-2">
                <span className="text-body">Final Cut Pro library</span>
                <div className="flex items-center gap-2">
                  <input
                    className="field min-w-0 flex-1"
                    dir="auto"
                    placeholder="/Users/you/Movies/Client.fcpbundle"
                    aria-invalid={libraryProblem ? true : undefined}
                    value={settings.fcpLibrary}
                    onChange={(e) => set({ fcpLibrary: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const dir = await window.electronAPI?.pickFcpLibrary?.();
                      if (dir) set({ fcpLibrary: dir });
                    }}
                  >
                    Choose
                  </button>
                </div>
                <span className="t-meta">
                  {libraryText
                    ? "It must already exist. If it is missing, nothing is sent, so Final Cut never makes a stray library."
                    : "Leave blank and Final Cut picks the library. Set one if you keep several open."}
                </span>
              </label>
            </Section>
            <Section
              panelId={`${titleId}-projects`}
              title="Projects"
              summary={projectsSummary}
              open={section === "projects"}
              onToggle={() => toggle("projects")}
            >
              <label className="flex flex-col gap-2">
                <span className="text-body">Project name</span>
                <input
                  className="field"
                  dir="auto"
                  value={settings.projectNamePattern}
                  onChange={(e) => set({ projectNamePattern: e.target.value })}
                />
                <span className="t-meta">
                  Use {"{clipId}"}, {"{label}"}, {"{campaign}"} and {"{source}"}.
                  {previewNames.length > 0 ? ` Now: ${previewNames.join(", ")}.` : ""} If a name already exists, Final Cut asks whether to replace it or keep both.
                  {settings.projectNamePattern.trim() && !settings.projectNamePattern.includes("{clipId}")
                    ? " Add {clipId} so every project name is unique."
                    : ""}
                </span>
              </label>
              <label className="flex flex-col gap-2">
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
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-body">Timeline</span>
                  <select
                    className="field"
                    value={settings.timelineFormat.kind}
                    onChange={(e) => {
                      const kind = e.target.value as TimelineKind;
                      // The frame rate is left as it is: vertical follows the video by default, so a kind change must not write 30.
                      set({ timelineFormat: { ...settings.timelineFormat, kind } });
                    }}
                  >
                    <option value="vertical">Vertical 1080 x 1920</option>
                    <option value="source">Match source</option>
                    <option value="look">From your look</option>
                    <option value="custom">Custom size</option>
                  </select>
                </label>
                {settings.timelineFormat.kind === "custom" && (
                  <>
                    <label className="flex flex-col gap-2">
                      <span className="text-body">Width</span>
                      <input
                        className="field w-24"
                        inputMode="numeric"
                        value={settings.timelineFormat.width}
                        onChange={(e) => set({ timelineFormat: { ...settings.timelineFormat, width: Number(e.target.value.replace(/\D/g, "")) } })}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
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
                <label className="flex flex-col gap-2">
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
            </Section>
            <Section
              panelId={`${titleId}-capcut`}
              title="CapCut"
              summary={settings.capcutDropDir ? baseName(settings.capcutDropDir) : "No drop folder"}
              open={section === "capcut"}
              onToggle={() => toggle("capcut")}
            >
              <p className="t-meta m-0">
                CapCut cannot import project files. Cut clips are copied into a folder you add in CapCut's media panel.
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
                  className="chip"
                  disabled={busy || !settings.capcutDropDir}
                  onClick={() => void reveal(settings.capcutDropDir, "a drop folder")}
                >
                  Reveal drop folder
                </button>
                <button
                  type="button"
                  className="chip"
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
            </Section>
          </div>
          <p className="t-meta m-0">Premiere Pro cannot open this file without a third-party converter.</p>
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
