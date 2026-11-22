/**
 * File: CampaignMenu.tsx
 * Path: src/components/CampaignMenu.tsx
 * Description: Body of the header campaign popover (BUILD-SPEC section 5): switch campaign,
 *   create, edit, remove. Switching re-points the length band, naming, both folders,
 *   format/quality and the used-ranges record at once. No filled-accent button here: the
 *   screen's one primary action is Cut.
 */
import { useState } from "react";
import { useClipperContext } from "../context/ClipperContext";
import { useCampaign } from "../context/CampaignContext";
import {
  describeCampaignProblem,
  formatClipId,
  validateCampaign,
  type Campaign,
} from "../lib/campaigns";
import { formatLength } from "../lib/segments";

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
    pattern: c?.clipIdPattern ?? "{prefix}-{videoId}-{nn}",
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
  const [d, setD] = useState<Draft>(() => toDraft(editing, folders));
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const pick = async (k: "clipsDir" | "dataDir") => {
    const dir = await window.electronAPI?.pickDirectory();
    if (dir) set(k, dir);
  };

  const preview = formatClipId(
    { clipIdPattern: d.pattern || "{prefix}-{videoId}-{nn}", prefix: d.prefix || "XX" },
    "VIDEOID",
    1,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = campaignFormProblems(d, campaigns, editing?.id);
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
      dataDir: d.dataDir,
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
        <Field label="Target min (s)">
          <input className="field font-mono" inputMode="numeric" value={d.min} onChange={(e) => set("min", e.target.value)} />
        </Field>
        <Field label="Target max (s)">
          <input className="field font-mono" inputMode="numeric" value={d.max} onChange={(e) => set("max", e.target.value)} />
        </Field>
        <Field label="Hard cap (s)">
          <input className="field font-mono" inputMode="numeric" value={d.hard} onChange={(e) => set("hard", e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Field label="Clip id prefix">
          <input
            className="field font-mono"
            value={d.prefix}
            placeholder="Auto"
            onChange={(e) => set("prefix", e.target.value)}
          />
        </Field>
        <Field label="Clip id pattern">
          <input className="field font-mono" value={d.pattern} onChange={(e) => set("pattern", e.target.value)} />
        </Field>
      </div>
      <p className="m-0 text-meta text-fg-dim">
        Next clip id looks like <span className="font-mono text-fg">{preview}</span>
      </p>
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
              ["dataDir", "Data folder"],
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

export default function CampaignMenu({ onClose }: { onClose?: () => void }) {
  const { campaigns, activeId, setActiveId, remove } = useCampaign();
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "form"; id: string | null }>({
    kind: "list",
  });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-2">
      {campaigns.length === 0 ? (
        <p className="m-0 text-meta text-fg-dim">
          No campaigns yet. A campaign sets a clip length band, a clip id pattern, format and
          quality, and two save folders.
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
      <button type="button" className="btn" onClick={() => setMode({ kind: "form", id: null })}>
        New campaign
      </button>
    </div>
  );
}
