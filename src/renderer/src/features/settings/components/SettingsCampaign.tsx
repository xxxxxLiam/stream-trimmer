/**
 * File: SettingsCampaign.tsx
 * Path: src/renderer/src/features/settings/components/SettingsCampaign.tsx
 * Description: One campaign (Settings.dc.html view 3): Name, Clips a day, Extra seconds at both ends,
 *   Languages, Folder with Change and Open, one button for the ticked editor (opens its own page), and
 *   Delete campaign. No clip id fields, no format or quality.
 */
import { useState } from "react";
import { MAX_RULE_SEC } from "../../../shared/utils/campaigns";
import { formatClock } from "../../../shared/utils/clock";
import { parseTimestamp } from "../../../shared/utils/clip";
import { DrawerHeader, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";
import { EXTRA_SECONDS_CHOICES, stepClipsPerDay, type CampaignPrefs } from "../utils/settingsPrefs";

export type SettingsCampaignProps = {
  name: string;
  prefs: CampaignPrefs;
  /** Clips a day (`Campaign.dailyQuota`); the top bar shows "N of M today" from it. */
  quota: number;
  onQuota: (n: number) => void;
  folderLabel: string;
  /** The optional clip length rule in seconds (either end may be unset), and writing it. Never blocks Clip. */
  lengthRule: { min?: number; max?: number };
  onLengthRule: (patch: { lengthMinSec?: number; lengthMaxSec?: number }) => void;
  /** Dub tracks of the open video. The Languages block shows only when there are some. */
  dubs: { code: string; label: string }[];
  /** The button for the editor ticked in the Clip menu; null for Save to folder and CapCut, which have nothing to set. */
  editor: { label: string; summary: string; onOpen: () => void } | null;
  onPatch: (p: Partial<CampaignPrefs>) => void;
  onToggleLanguage: (code: string) => void;
  onOpenFolder: () => void;
  /** Choose a different folder for this campaign. Returns a sentence when it was refused, else null. */
  onChangeFolder: () => Promise<string | null>;
  /** Rename. Returns the problem sentences (empty, too long, taken) or none once saved. */
  onRename: (name: string) => string[];
  /** True after the first click on Delete; the second click deletes. */
  confirmingDelete: boolean;
  onDelete: () => void;
  onBack: () => void;
  onClose: () => void;
};

const stepButton = "h-target w-target rounded-control border border-hairlineStrong bg-raised text-section text-fg hover:bg-hover disabled:text-disabled";
const fieldInput = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg outline-none focus:border-ice-tint-50";

export default function SettingsCampaign(p: SettingsCampaignProps) {
  const { prefs } = p;
  const [draft, setDraft] = useState<string | null>(null);
  const [nameProblem, setNameProblem] = useState("");
  const [folderProblem, setFolderProblem] = useState("");
  const [lengthDraft, setLengthDraft] = useState<{ min?: string; max?: string }>({});
  const [lengthProblem, setLengthProblem] = useState("");
  const commitLength = (end: "min" | "max") => {
    const text = lengthDraft[end];
    if (text === undefined) return;
    const parsed = text.trim() === "" ? undefined : parseTimestamp(text);
    const bad =
      parsed === null || (parsed !== undefined && parsed < 1)
        ? "Use minutes and seconds, like 0:30."
        : parsed !== undefined && parsed > MAX_RULE_SEC
          ? "A clip length rule can be at most 24:00:00."
          : "";
    setLengthProblem(bad);
    setLengthDraft((d) => ({ ...d, [end]: undefined }));
    if (bad) return;
    const next = parsed ?? undefined;
    const other = end === "min" ? p.lengthRule.max : p.lengthRule.min;
    // Typing past the other end in one step is allowed: the two swap, so the shorter is always first.
    if (next !== undefined && other !== undefined && (end === "min" ? next > other : next < other)) {
      p.onLengthRule({ lengthMinSec: end === "min" ? other : next, lengthMaxSec: end === "min" ? next : other });
      return;
    }
    p.onLengthRule(end === "min" ? { lengthMinSec: next ?? undefined } : { lengthMaxSec: next ?? undefined });
  };
  const lengthField = (end: "min" | "max", label: string) => (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={lengthProblem ? true : undefined}
      placeholder={end === "min" ? "0:30" : "1:00"}
      value={lengthDraft[end] ?? (p.lengthRule[end] ? formatClock(p.lengthRule[end] ?? 0) : "")}
      onChange={(e) => { setLengthDraft((d) => ({ ...d, [end]: e.target.value })); setLengthProblem(""); }}
      onBlur={() => commitLength(end)}
      onKeyDown={(e) => { if (e.key === "Enter") commitLength(end); }}
      className={`${fieldInput} w-[72px] text-center [font-variant-numeric:tabular-nums] ${lengthProblem ? "border-error" : ""}`}
    />
  );
  const commitName = () => {
    if (draft === null) return;
    if (draft.trim() === p.name) {
      setDraft(null);
      setNameProblem("");
      return;
    }
    const found = p.onRename(draft);
    setNameProblem(found[0] ?? "");
    if (!found.length) setDraft(null);
  };
  return (
    <>
      <DrawerHeader closeName="Settings" title={p.name} back="Campaigns" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
      <div className="flex flex-col gap-[8px] border-b border-hairline py-[12px]">
        <label htmlFor="campaign-name" className="text-body leading-[normal]">Name</label>
        <input
          id="campaign-name"
          type="text"
          maxLength={80}
          value={draft ?? p.name}
          aria-invalid={nameProblem ? true : undefined}
          aria-describedby={nameProblem ? "campaign-name-problem" : undefined}
          onChange={(e) => { setDraft(e.target.value); setNameProblem(""); }}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape" && draft !== null) { e.stopPropagation(); setDraft(null); setNameProblem(""); }
          }}
          className={`${fieldInput} ${nameProblem ? "border-error" : ""}`}
        />
        {nameProblem && <span id="campaign-name-problem" role="alert" className="text-meta text-error">{nameProblem}</span>}
      </div>
      <div className="flex h-[53px] items-center gap-[8px] border-b border-hairline">
        <span className="flex-1 text-body leading-[normal]">Clips a day</span>
        <button type="button" aria-label="One fewer clip a day" disabled={p.quota <= 1} onClick={() => p.onQuota(stepClipsPerDay(p.quota, -1))} className={stepButton}>−</button>
        <span aria-live="polite" className="w-[24px] text-center text-body leading-[normal] [font-variant-numeric:tabular-nums]">{p.quota}</span>
        <button type="button" aria-label="One more clip a day" onClick={() => p.onQuota(stepClipsPerDay(p.quota, 1))} className={stepButton}>+</button>
      </div>
      <div className="flex flex-col gap-[8px] border-b border-hairline py-[12px]">
        <span className="text-body leading-[normal]">Extra seconds at both ends</span>
        <div role="radiogroup" aria-label="Extra seconds at both ends" className="flex gap-[8px]">
          {EXTRA_SECONDS_CHOICES.map((n) => {
            const on = prefs.extraSeconds === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${n} seconds`}
                onClick={() => p.onPatch({ extraSeconds: n })}
                className={`h-target min-w-[44px] rounded-[22px] px-[12px] text-body leading-[normal] ${on ? "bg-ice text-bg" : "border border-hairlineStrong bg-raised text-fg"}`}
              >
                {n}s
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-[8px] border-b border-hairline py-[12px]">
        <div role="group" aria-label="Clip length" className="flex items-center gap-[8px]">
          <span className="flex-1 text-body leading-[normal]">Clip length</span>
          {lengthField("min", "Shortest clip length")}
          <span className="text-body text-fg-dim">to</span>
          {lengthField("max", "Longest clip length")}
        </div>
        {lengthProblem ? <span role="alert" className="text-meta text-error">{lengthProblem}</span> : <span className="text-meta text-fg-dim">Leave empty if {p.name} has no length rule.</span>}
      </div>
      {p.dubs.length > 0 && (
      <div className="flex flex-col gap-[8px] border-b border-hairline py-[12px]">
        <div className="flex flex-col gap-[2px]">
          <span className="text-body leading-[normal]">Languages</span>
          <span className="text-meta text-fg-dim">Shown only when the video has dubs</span>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          {[{ code: "original", label: "Original" }, ...p.dubs].map((l) => {
            const on = prefs.languages.includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={on}
                aria-label={`${l.label} audio, ${on ? "ticked" : "not ticked"}`}
                onClick={() => p.onToggleLanguage(l.code)}
                className={`inline-flex h-target items-center gap-[6px] rounded-[22px] px-[16px] text-body leading-[normal] ${on ? "bg-ice text-bg" : "border border-hairlineStrong bg-raised text-fg"}`}
              >
                {on && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
      )}
      <div className="flex flex-col gap-[4px] py-[12px]">
      <div className="flex items-center gap-[8px]">
        <div className="flex min-w-[0px] flex-1 flex-col gap-[2px]">
          <span className="text-body leading-[normal]">Folder</span>
          <span className="truncate text-meta text-fg-dim">{p.folderLabel}</span>
        </div>
        <button type="button" aria-label={`Change the ${p.name} folder`} onClick={() => void p.onChangeFolder().then((e) => setFolderProblem(e ?? ""))} className={outlineButton}>
          Change
        </button>
        <button type="button" aria-label={`Open the ${p.name} folder`} onClick={p.onOpenFolder} className={outlineButton}>
          Open
        </button>
      </div>
      {folderProblem && <span role="alert" className="text-meta text-error">{folderProblem}</span>}
      </div>
      {p.editor && (
        <button type="button" aria-label={`${p.editor.label} settings for ${p.name}`} onClick={p.editor.onOpen} className="mt-[4px] flex min-h-[56px] items-center gap-[12px] rounded-control border border-hairlineStrong bg-raised px-[12px] py-[8px] text-left hover:bg-hover">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-fg-dim" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="m9 15 6-6M9 9h6v6" />
          </svg>
          <span className="flex min-w-[0px] flex-1 flex-col gap-[2px]">
            <span className="text-body font-medium leading-[normal] text-fg">{p.editor.label}</span>
            <span className="truncate text-meta text-fg-dim">{p.editor.summary}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-fg-dim" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
      <button type="button" aria-label={p.confirmingDelete ? `Click again to delete ${p.name}` : `Delete campaign ${p.name}`} onClick={p.onDelete} className="mt-[8px] h-target self-start bg-transparent text-meta text-fg-dim underline underline-offset-[3px]">
        {p.confirmingDelete ? `Click again to delete ${p.name}` : "Delete campaign"}
      </button>
      </div>
    </>
  );
}
