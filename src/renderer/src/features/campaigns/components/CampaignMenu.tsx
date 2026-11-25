/**
 * File: CampaignMenu.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignMenu.tsx
 * Description: Body of the header campaign popover (BUILD-SPEC section 5): switch campaign,
 *   create, edit, remove. Switching re-points the length band, naming, both folders,
 *   format/quality and the used-ranges record at once. No filled-accent button here: the
 *   screen's one primary action is Cut.
 */
import { useState } from "react";
import CampaignWizard from "./CampaignWizard";
import { useDataFolderVisibleState } from "../../../shared/hooks/useDataFolderVisibleState";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../hooks/CampaignContext";
import {
  DEFAULT_PATTERN,
  describeCampaignProblem,
  reconcileDataDir,
  todayCount,
  validateCampaign,
  type Campaign,
} from "../../../shared/utils/campaigns";

type Draft = {
  name: string;
  min: string;
  max: string;
  hard: string;
  pattern: string;
  prefix: string;
  format: "mp4" | "mp3";
  clipsDir: string;
  dataDir: string;
};

function toDraft(c: Campaign | null, fallback: { clipsDir: string; dataDir: string }): Draft {
  return {
    name: c?.name ?? "",
    min: String(c?.targetMinSec ?? 30),
    max: String(c?.targetMaxSec ?? 60),
    hard: String(c?.hardMaxSec ?? 90),
    pattern: c?.clipIdPattern ?? DEFAULT_PATTERN,
    prefix: c?.prefix ?? "",
    format: c?.format ?? "mp4",
    clipsDir: c?.clipsDir ?? fallback.clipsDir,
    dataDir: c?.dataDir ?? fallback.dataDir,
  };
}

function secs(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-meta text-fg-dim">{label}</span>
      {children}
    </label>
  );
}

/** What stops this form being saved. The OTHER campaigns (not the one being edited) are passed so a
 *  clashing name is caught (C-5). Exported for tests. */
export function campaignFormProblems(
  d: Pick<Draft, "name" | "clipsDir" | "dataDir" | "pattern">,
  campaigns: readonly Pick<Campaign, "id" | "name">[],
  editingId?: string,
): string[] {
  return validateCampaign(
    { name: d.name, clipsDir: d.clipsDir, dataDir: d.dataDir, clipIdPattern: d.pattern },
    campaigns.filter((c) => c.id !== editingId),
  ).map(describeCampaignProblem);
}

function CampaignForm({
  editing,
  onDone,
}: {
  editing: Campaign | null;
  onDone: (id?: string) => void;
}) {
  const { create, update, folders, campaigns } = useCampaign();
  const { isElectron, format, quality } = useClipperContext();
  const dataVisible = useDataFolderVisibleState();
  const [d, setD] = useState<Draft>(() => toDraft(editing, folders));
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const pick = async (k: "clipsDir" | "dataDir") => {
    const dir = await window.electronAPI?.pickDirectory();
    if (dir) set(k, dir);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataDir = reconcileDataDir(d.clipsDir, d.dataDir, dataVisible);
    const found = campaignFormProblems({ ...d, dataDir }, campaigns, editing?.id);
    if (found.length) {
      setProblems(found);
      return;
    }
    const fields = {
      name: d.name,
      targetMinSec: secs(d.min),
      targetMaxSec: secs(d.max),
      hardMaxSec: secs(d.hard),
      clipIdPattern: d.pattern.trim(),
      prefix: d.prefix.trim() || undefined,
      format: d.format,
      clipsDir: d.clipsDir,
      dataDir,
    };
    if (editing) {
      update(editing.id, { ...fields, prefix: fields.prefix ?? editing.prefix });
      onDone(editing.id);
    } else {
      const c = create({ ...fields, quality });
      onDone(c.id);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <span className="text-body font-medium">{editing ? "Edit campaign" : "New campaign"}</span>
      <Field label="Name">
        <input
          className="field"
          value={d.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus
          aria-invalid={problems.length > 0 && !d.name.trim()}
        />
      </Field>
      <div className="flex gap-2">
        <Field label="Aim for at least (seconds)">
          <input className="field font-mono" inputMode="numeric" value={d.min} onChange={(e) => set("min", e.target.value)} />
        </Field>
        <Field label="Aim for at most (seconds)">
          <input className="field font-mono" inputMode="numeric" value={d.max} onChange={(e) => set("max", e.target.value)} />
        </Field>
        <Field label="Never longer than (seconds)">
          <input className="field font-mono" inputMode="numeric" value={d.hard} onChange={(e) => set("hard", e.target.value)} />
        </Field>
      </div>
      <Field label="Format">
        <select
          className="field"
          value={d.format}
          onChange={(e) => set("format", e.target.value as "mp4" | "mp3")}
        >
          <option value="mp4">MP4 video</option>
          <option value="mp3">MP3 audio</option>
        </select>
      </Field>
      {isElectron && (
        <div className="flex flex-col gap-2">
          {(
            [
              ["clipsDir", "Clips folder"],
              ...(dataVisible ? ([["dataDir", "Data folder"]] as const) : []),
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-meta text-fg-dim">{label}</div>
                <div className="truncate text-body" title={d[k]}>
                  {d[k] ? baseName(d[k]) : "Not set"}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => void pick(k)}>
                Choose
              </button>
            </div>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <div role="alert" className="card-alert flex flex-col gap-1 px-3 py-2 text-meta">
          {problems.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="btn">
          {editing ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}

export default function CampaignMenu({
  onClose,
  onOpenSettings,
}: {
  onClose?: () => void;
  /**
   * Opens the campaign form for the active campaign. The workspace screen passes it (the Start,
   * Settings and Help build owns the form); without it the menu's own inline form is used.
   */
  onOpenSettings?: (campaignId: string) => void;
}) {
  const { campaigns, activeId, setActiveId } = useCampaign();
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "form"; id: string | null }>({
    kind: "list",
  });
  const [wizard, setWizard] = useState(false);

  if (mode.kind === "form") {
    const editing = mode.id ? (campaigns.find((c) => c.id === mode.id) ?? null) : null;
    return (
      <CampaignForm
        editing={editing}
        onDone={(id) => {
          setMode({ kind: "list" });
          if (id) onClose?.();
        }}
      />
    );
  }

  const current = campaigns.find((c) => c.id === activeId);
  const ROW =
    "flex h-[44px] w-full items-center gap-[10px] rounded-control px-[10px] text-left text-body text-fg hover:bg-hover";
  const openSettings = (id: string) => {
    if (onOpenSettings) {
      onOpenSettings(id);
      onClose?.();
    } else setMode({ kind: "form", id });
  };
  return (
    <div role="menu" aria-label="Campaigns" className="flex flex-col">
      <div className="px-[10px] pb-[4px] pt-[6px] text-meta text-fg-dim">Campaigns</div>
      {campaigns.length === 0 ? (
        <p className="m-0 px-[10px] py-[8px] text-meta text-fg-dim">
          No campaigns yet. A campaign remembers, for one client, how long clips should be, how
          they are named, and the folder they are saved in.
        </p>
      ) : (
        <ul id="ui-campaign-list" className="m-0 flex list-none flex-col p-0">
          {campaigns.map((c) => {
            const selected = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="menuitem"
                  aria-current={selected}
                  className={`${ROW} ${selected ? "bg-hover" : ""}`}
                  onClick={() => {
                    setActiveId(c.id);
                    onClose?.();
                  }}
                >
                  <span className="flex w-[12px] shrink-0 justify-center">
                    {selected ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--ice)" strokeWidth="1.8" aria-hidden="true">
                        <path d="M2 6.5l2.5 2.5L10 3.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-meta text-fg-dim">{todayCount(c) ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div role="separator" className="mx-[4px] my-[6px] h-px bg-hairline" />
      {current ? (
        <button type="button" id="ui-campaign-settings" role="menuitem" className={ROW} onClick={() => openSettings(current.id)}>
          <span className="inline-flex text-fg-dim">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="2.2" />
              <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
            </svg>
          </span>
          <span className="min-w-0 truncate">{current.name} settings</span>
          <span className="ml-auto inline-flex text-fg-dim">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3.5 2l3 3-3 3" />
            </svg>
          </span>
        </button>
      ) : null}
      <button type="button" role="menuitem" className={ROW} onClick={() => setWizard(true)}>
        <span className="w-[16px] text-center text-fg-dim">+</span>
        New campaign
      </button>
      <CampaignWizard open={wizard} onClose={() => setWizard(false)} onCreated={() => onClose?.()} />
    </div>
  );
}
