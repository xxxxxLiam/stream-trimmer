/**
 * File: CampaignMenu.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignMenu.tsx
 * Description: Body of the header campaign popover (BUILD-SPEC section 5): switch campaign,
 *   create, edit, remove. Switching re-points the length band, naming, both folders,
 *   format/quality and the used-ranges record at once. No filled-accent button here: the
 *   screen's one primary action is Cut.
 */
import { useState } from "react";
import ClipIdPatternField from "./ClipIdPatternField";
import CampaignWizard from "./CampaignWizard";
import { useDataFolderVisibleState } from "../../../shared/hooks/useDataFolderVisibleState";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../hooks/CampaignContext";
import {
  DEFAULT_PATTERN,
  describeCampaignProblem,
  reconcileDataDir,
  validateCampaign,
  type Campaign,
} from "../../../shared/utils/campaigns";
import { formatLength } from "../../../shared/utils/segments";

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
      <div className="flex gap-2">
        <Field label="Short code for this client">
          <input
            className="field font-mono"
            value={d.prefix}
            placeholder="Made from the name"
            onChange={(e) => set("prefix", e.target.value)}
          />
        </Field>
      </div>
      <ClipIdPatternField
        pattern={d.pattern}
        prefix={d.prefix}
        campaignName={d.name}
        onChange={(v) => set("pattern", v)}
      />
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
  const { campaigns, activeId, setActiveId, remove } = useCampaign();
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "form"; id: string | null }>({
    kind: "list",
  });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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
  return (
    <div className="flex flex-col gap-2">
      {current ? (
        <button
          type="button"
          id="ui-campaign-settings"
          className="btn justify-start"
          onClick={() => {
            if (onOpenSettings) {
              onOpenSettings(current.id);
              onClose?.();
            } else setMode({ kind: "form", id: current.id });
          }}
        >
          {current.name} settings
        </button>
      ) : null}
      {campaigns.length === 0 ? (
        <p className="m-0 text-meta text-fg-dim">
          No campaigns yet. A campaign remembers, for one client, how long clips should be, how
          they are named, the format, and the folder they are saved in.
        </p>
      ) : (
        <ul id="ui-campaign-list" className="m-0 flex list-none flex-col gap-1 p-0" role="listbox" aria-label="Campaigns">
          {campaigns.map((c) => {
            const selected = c.id === activeId;
            return (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`btn min-w-0 flex-1 justify-start text-left ${selected ? "border-accent" : ""}`}
                  onClick={() => {
                    setActiveId(c.id);
                    onClose?.();
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 font-mono text-meta text-fg-dim">
                    {formatLength(c.targetMinSec)} to {formatLength(c.targetMaxSec)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn shrink-0"
                  onClick={() => setMode({ kind: "form", id: c.id })}
                  aria-label={`Edit ${c.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn shrink-0"
                  onClick={() => {
                    if (confirmRemove === c.id) {
                      remove(c.id);
                      setConfirmRemove(null);
                    } else setConfirmRemove(c.id);
                  }}
                  aria-label={`Remove ${c.name}`}
                  title="Removes the campaign and its used-ranges record. Cut clips stay in their folder."
                >
                  {confirmRemove === c.id ? "Confirm" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn" onClick={() => setWizard(true)}>
        New campaign
      </button>
      <CampaignWizard
        open={wizard}
        onClose={() => setWizard(false)}
        onCreated={() => onClose?.()}
      />
    </div>
  );
}
