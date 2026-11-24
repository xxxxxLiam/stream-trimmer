/**
 * File: SetupChecklist.tsx
 * Path: src/renderer/src/features/help/components/SetupChecklist.tsx
 * Description: The setup checklist body (BUILD-SPEC A7), mounted inside the help drawer.
 *   Thin on purpose: all logic is src/renderer/src/features/help/utils/setupTasks.ts. Done state is derived from live
 *   app state on every render and nothing is stored, so clearing a folder un-ticks it.
 *   Controls are secondary buttons; the drawer's Next step keeps the one filled accent.
 *
 *   The per-campaign editor settings are held in App.tsx state and written to the settings
 *   store, with no change event, so they are re-read from the store on a short interval
 *   and on window focus while this is mounted.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { bankStore } from "../../../shared/utils/bank";
import { normalizeEditorSettings } from "../../../shared/utils/fcpxml";
import { readSetting } from "../../../shared/utils/persist";
import { CHANNEL_DATA_BUILT, useOwnerAccess } from "../../../shared/utils/ownerGate";
import {
  SETUP_FIRST_LINE,
  buildSetupItems,
  setupProgress,
  type SetupAction,
  type SetupInput,
  type SetupItem,
} from "../utils/setupTasks";
import {
  deriveSessionStatus,
  importCookies,
  useYouTubeConnection,
} from "../../../shared/utils/youtubeConnection";

const EDITOR_KEY = "clipper.editorHandoff";

function readEditor(campaignId: string | null) {
  if (!campaignId) return null;
  const all = readSetting<Record<string, unknown>>(EDITOR_KEY, {});
  const raw = all && typeof all === "object" ? all[campaignId] : undefined;
  return raw === undefined || raw === null ? null : normalizeEditorSettings(raw);
}

function Tick({ done, blocked }: { done: boolean; blocked: boolean }) {
  // Shape, not colour: filled disc with a check, or an empty ring.
  return (
    <span
      role="img"
      aria-label={done ? "Done" : blocked ? "Waiting" : "Not done"}
      className={
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border " +
        (done ? "border-fg bg-fg text-bg" : "border-hairlineStrong text-fg-dim")
      }
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      ) : null}
    </span>
  );
}

export default function SetupChecklist() {
  const { campaigns, active, folders, pickClipsDir, pickDataDir, confirmDataDir } = useCampaign();
  const { info } = useClipperContext();
  const conn = useYouTubeConnection();
  const ownerAccess = useOwnerAccess();
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
  const [, setTick] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const t = window.setInterval(bump, 1000);
    window.addEventListener("focus", bump);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const editor = readEditor(active?.id ?? null);

  const bankedClips = useMemo(() => {
    if (!active) return 0;
    const videos = bank[active.id] ?? {};
    return Object.values(videos).reduce((n, list) => n + list.length, 0);
  }, [bank, active]);

  // Cheap and pure, so it is rebuilt on every render (the interval above re-renders).
  const items = (() => {
    const input: SetupInput = {
      signIn: deriveSessionStatus(conn),
      campaigns,
      campaign: active
        ? {
            id: active.id,
            name: active.name,
            clipsDir: active.clipsDir,
            dataDir: active.dataDir,
            targetMinSec: active.targetMinSec,
            targetMaxSec: active.targetMaxSec,
            hardMaxSec: active.hardMaxSec,
            clipIdPattern: active.clipIdPattern,
          }
        : null,
      dataDirConfirmed: folders.dataDirConfirmed,
      exporter: CHANNEL_DATA_BUILT && ownerAccess,
      videoLoaded: Boolean(info),
      afterCutting: editor ? editor.afterCutting : null,
      finalCut: {
        fcpLibrary: editor?.fcpLibrary ?? "",
        mediaEvent: editor?.mediaEvent ?? "",
        projectEvent: editor?.projectEvent ?? "",
        timelineFormat: editor
          ? {
              width: editor.timelineFormat.width,
              height: editor.timelineFormat.height,
              fps: editor.timelineFormat.fps,
            }
          : null,
      },
      bankedClips,
    };
    return buildSetupItems(input);
  })();

  const progress = setupProgress(items);

  const run = useCallback(
    async (action: SetupAction) => {
      setProblem(null);
      switch (action) {
        case "sign-in": {
          if (conn.canImport) await importCookies();
          else document.getElementById("help-anchor-youtube-status")?.click();
          return;
        }
        case "open-campaigns": {
          const chip = document.getElementById("ui-campaign-chip");
          if (chip && chip.getAttribute("aria-expanded") !== "true") chip.click();
          chip?.focus();
          return;
        }
        case "pick-clips-folder":
          setProblem(await pickClipsDir());
          return;
        case "pick-data-folder":
          setProblem(await pickDataDir());
          return;
        case "confirm-data-folder":
          confirmDataDir();
          return;
        case "open-editor-handoff": {
          const section = document.querySelector<HTMLElement>('[aria-label="Editor handoff"]');
          const toggle = section?.querySelector<HTMLButtonElement>("button[aria-expanded]");
          if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
          toggle?.focus();
          toggle?.focus();
          return;
        }
        case "open-bank": {
          const tabs = document.getElementById("help-anchor-clips-tabs");
          const bankTab = Array.from(tabs?.querySelectorAll<HTMLElement>("button, [role=tab]") ?? []).find(
            (el) => /^bank\b/i.test(el.textContent?.trim() ?? ""),
          );
          bankTab?.click();
          bankTab?.focus();
          return;
        }
      }
    },
    [conn.canImport, pickClipsDir, pickDataDir, confirmDataDir],
  );

  const row = (it: SetupItem) => {
    const sub = Boolean(it.parentId);
    return (
      <li
        key={it.id}
        data-setup-item={it.id}
        data-done={it.done ? "true" : "false"}
        data-blocked={it.blocked ? "true" : "false"}
        className={"flex gap-3 rounded-control border border-hairline p-3 " + (sub ? "ml-6" : "")}
      >
        <Tick done={it.done} blocked={it.blocked} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body text-fg">
            <span>{it.title}</span>
            {it.optional && <span className="text-meta text-fg-dim">Optional</span>}
            {it.note && <span className="text-meta text-fg-dim">{it.note}</span>}
          </p>
          <p className="mt-1 text-meta text-fg-dim">{it.what}</p>
          <p className="text-meta text-fg-dim">{it.why}</p>
          {it.blocked ? (
            <p className="mt-2 text-meta text-fg-dim">Waiting for: {it.blockedBy.join(", ")}</p>
          ) : (
            <button type="button" className="btn mt-2" onClick={() => void run(it.action)}>
              {it.actionLabel}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section aria-label="Setup checklist" className="flex flex-col gap-3">
      <p className="text-body text-fg">{SETUP_FIRST_LINE}</p>
      <p className="text-meta text-fg-dim" role="status" aria-live="polite">
        {active ? (
          <>
            Folders and options below are for <span className="text-fg">{active.name}</span>. A new campaign
            starts this list again.
          </>
        ) : (
          "Create or pick a campaign to set up its folders and options."
        )}{" "}
        {progress.done} of {progress.total} done.
      </p>
      {problem && (
        <p role="alert" className="text-meta text-accent">
          {problem}
        </p>
      )}
      <ol className="flex flex-col gap-2">{items.map(row)}</ol>
    </section>
  );
}
