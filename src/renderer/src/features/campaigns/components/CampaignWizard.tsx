/**
 * File: CampaignWizard.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignWizard.tsx
 * Description: Guided, one-question-at-a-time campaign setup (docs/campaign-wizard.md). Every
 *   step says why it matters. It collects the same fields as the flat form and saves through the
 *   same create() path (createCampaign), so there is one way a campaign is made. Always
 *   dismissible: Esc, the close button, or "Not now" leave nothing half-created.
 */
import { useState } from "react";
import CentredDialog from "../../../shared/components/CentredDialog";
import { useDataFolderVisibleState } from "../../../shared/hooks/useDataFolderVisibleState";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../hooks/CampaignContext";
import {
  DEFAULT_BAND,
  DEFAULT_PATTERN,
  describeCampaignProblem,
  reconcileDataDir,
  validateCampaign,
  type Campaign,
} from "../../../shared/utils/campaigns";

type StepId = "name" | "clips" | "data" | "length" | "format";

const COPY: Record<StepId, { title: string; why: string }> = {
  name: {
    title: "What is this campaign called?",
    why: "Use the client or show you are cutting for. Everything you set up next is remembered under this name, so each tab can stay on one client.",
  },
  clips: {
    title: "Where should finished clips go?",
    why: "Clips land straight in this client's folder, ready to hand over, and cutting is faster. Changing it later only affects new clips. Clips you already cut stay where they are.",
  },
  data: {
    title: "Where should research files go?",
    why: "Kept apart from your finished clips so the two never get mixed up. It has to be a different folder from the clips folder.",
  },
  length: {
    title: "How long should clips be?",
    why: "Clipr warns you while you are choosing a clip, before it is out of spec, not after you have cut it.",
  },
  format: {
    title: "Video or audio only?",
    why: "Set it once for this client instead of for every clip.",
  },
};

function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
}

function secs(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function FolderPick({
  label,
  dir,
  onPick,
}: {
  label: string;
  dir: string;
  onPick: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-meta text-fg-dim">{label}</div>
        <div className="truncate text-body" title={dir}>
          {dir ? baseName(dir) : "Not chosen yet"}
        </div>
      </div>
      <button type="button" className="btn" onClick={onPick}>
        {dir ? "Choose another" : "Choose folder"}
      </button>
    </div>
  );
}

function Body({ onClose, onCreated }: { onClose: () => void; onCreated?: (c: Campaign) => void }) {
  const { create, campaigns, folders } = useCampaign();
  const { isElectron, quality } = useClipperContext();
  const dataVisible = useDataFolderVisibleState();

  const steps: StepId[] = [
    "name",
    ...(isElectron ? (["clips"] as const) : []),
    ...(isElectron && dataVisible ? (["data"] as const) : []),
    "length",
    "format",
  ];
  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [clipsDir, setClipsDir] = useState(folders.clipsDir);
  const [dataDir, setDataDir] = useState(folders.dataDir);
  const [min, setMin] = useState(String(DEFAULT_BAND.targetMinSec));
  const [max, setMax] = useState(String(DEFAULT_BAND.targetMaxSec));
  const [hard, setHard] = useState(String(DEFAULT_BAND.hardMaxSec));
  const [format, setFormat] = useState<"mp4" | "mp3">("mp4");
  const [problems, setProblems] = useState<string[]>([]);

  const step = steps[i];
  const last = i === steps.length - 1;
  const finalDataDir = reconcileDataDir(clipsDir, dataDir, dataVisible);

  const problemsFor = (id: StepId): string[] => {
    const all = validateCampaign(
      { name, clipsDir, dataDir: finalDataDir, clipIdPattern: DEFAULT_PATTERN },
      campaigns,
    );
    const mine: Record<StepId, string[]> = {
      name: ["name-empty", "name-taken"],
      clips: ["folders-same"],
      data: ["folders-same"],
      length: [],
      format: [],
    };
    return all.filter((p) => mine[id].includes(p)).map(describeCampaignProblem);
  };

  const pickFolder = async (set: (d: string) => void) => {
    const dir = await window.electronAPI?.pickDirectory();
    if (dir) {
      set(dir);
      setProblems([]);
    }
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const found = problemsFor(step);
    setProblems(found);
    if (found.length) return;
    if (!last) {
      setI(i + 1);
      return;
    }
    const c = create({
      name,
      targetMinSec: secs(min),
      targetMaxSec: secs(max),
      hardMaxSec: secs(hard),
      clipIdPattern: DEFAULT_PATTERN,
      format,
      quality,
      clipsDir,
      dataDir: finalDataDir,
    });
    onCreated?.(c);
    onClose();
  };

  return (
    <form onSubmit={next} className="flex flex-col gap-4" id="ui-campaign-wizard">
      <div className="flex flex-col gap-1">
        <span className="text-meta text-fg-dim">
          Step {i + 1} of {steps.length}
        </span>
        <h3 className="m-0 text-body font-medium text-fg">{COPY[step].title}</h3>
        <p className="m-0 text-meta text-fg-dim">{COPY[step].why}</p>
      </div>

      {step === "name" && (
        <label className="flex flex-col gap-1">
          <span className="text-meta text-fg-dim">Campaign name</span>
          <input
            className="field"
            value={name}
            autoFocus
            placeholder="For example, Acme podcast"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problems.length > 0}
          />
        </label>
      )}

      {step === "clips" && (
        <FolderPick label="Clips folder" dir={clipsDir} onPick={() => void pickFolder(setClipsDir)} />
      )}

      {step === "data" && (
        <FolderPick label="Research folder" dir={dataDir} onPick={() => void pickFolder(setDataDir)} />
      )}

      {step === "length" && (
        <div className="flex gap-2">
          {(
            [
              ["Aim for at least (seconds)", min, setMin],
              ["Aim for at most (seconds)", max, setMax],
              ["Never longer than (seconds)", hard, setHard],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-meta text-fg-dim">{label}</span>
              <input
                className="field font-mono"
                inputMode="numeric"
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {step === "format" && (
        <label className="flex flex-col gap-1">
          <span className="text-meta text-fg-dim">Save clips as</span>
          <select
            className="field"
            value={format}
            onChange={(e) => setFormat(e.target.value as "mp4" | "mp3")}
          >
            <option value="mp4">MP4 video</option>
            <option value="mp3">MP3 audio</option>
          </select>
        </label>
      )}

      {problems.length > 0 && (
        <div role="alert" className="card-alert flex flex-col gap-1 px-3 py-2 text-meta">
          {problems.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Not now
        </button>
        <div className="flex gap-2">
          {i > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setProblems([]);
                setI(i - 1);
              }}
            >
              Back
            </button>
          )}
          <button type="submit" className="btn">
            {last ? "Create campaign" : "Next"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function CampaignWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (c: Campaign) => void;
}) {
  return (
    <CentredDialog open={open} onClose={onClose} title="New campaign" widthClass="max-w-[520px]" id="ui-campaign-wizard-dialog">
      <Body onClose={onClose} onCreated={onCreated} />
    </CentredDialog>
  );
}
