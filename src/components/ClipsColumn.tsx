/**
 * File: ClipsColumn.tsx
 * Path: src/components/ClipsColumn.tsx
 * Description: Right column (COLLECT). Three tabs: This video (what has been cut from it),
 *   Bank (imported candidate clips, with category and tier filters) and All saved (the
 *   download history). Clicking a bank row loads its segments into the mark bar; Cut on the
 *   row cuts it directly and, once saved, flips it to cut and records its ranges as used.
 *   BUILD-SPEC 12b and A1.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCampaign } from "../context/CampaignContext";
import { useClipperContext } from "../context/ClipperContext";
import { setBankedRanges, useSegments } from "../hooks/useSegments";
import {
  bankStore,
  bankedRanges,
  clipBand,
  clipLength,
  clipsFor,
  facets,
  filterClips,
  sortClips,
  type BankSort,
  type BankedClip,
} from "../lib/bank";
import type { ParsedClip } from "../lib/bankImport";
import { formatLength, formatTimecode } from "../lib/segments";
import DownloadsPanel from "./DownloadsPanel";
import ImportTimestamps from "./ImportTimestamps";

export type ClipsColumnProps = {
  className?: string;
  /**
   * Cut a banked clip directly (all its segments, joined as one file). Resolve true once the
   * file is saved; the row then flips to cut and its ranges join the campaign's used ranges.
   * Without it, Cut is disabled.
   */
  onCutBanked?: (clip: BankedClip) => Promise<boolean> | boolean;
};

type Tab = "video" | "bank" | "all";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "video", label: "This video" },
  { id: "bank", label: "Bank" },
  { id: "all", label: "All saved" },
];

const MONO = { fontVariantNumeric: "tabular-nums" } as const;

function useBankData() {
  return useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
}

/** Hollow = banked, filled = cut, filled with a ring = published. Differs by shape, not hue. */
function StatusDot({ status }: { status: BankedClip["status"] }) {
  const base = "mt-[5px] inline-block size-[10px] shrink-0 rounded-full";
  if (status === "banked") {
    return (
      <span
        role="img"
        aria-label="Banked"
        className={base}
        style={{ border: "1.5px solid var(--c-fg-dim, #969697)" }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={status === "cut" ? "Cut" : "Published"}
      className={base}
      style={{
        background: "var(--c-fg, #F5F5F7)",
        boxShadow: status === "published" ? "0 0 0 2px var(--c-panel, #161618), 0 0 0 3.5px var(--c-fg, #F5F5F7)" : undefined,
      }}
    />
  );
}

function RangeLines({ clip }: { clip: BankedClip }) {
  const shown = clip.segments.length > 3 ? clip.segments.slice(0, 2) : clip.segments;
  const more = clip.segments.length - shown.length;
  return (
    <span className="flex flex-col font-mono text-body text-fg" style={MONO}>
      {shown.map((s, i) => (
        <span key={i}>
          {formatTimecode(s.start)} - {formatTimecode(s.end)}
        </span>
      ))}
      {more > 0 && <span className="text-meta text-fg-dim">+{more} more segments</span>}
    </span>
  );
}

function tierText(tier: string): string {
  return /^\d+$/.test(tier) ? `T${tier}` : tier;
}

export default function ClipsColumn({ className, onCutBanked }: ClipsColumnProps) {
  const { videoId, duration } = useClipperContext();
  const { active, recordUse, usedFor } = useCampaign();
  const seg = useSegments();
  const data = useBankData();

  const [tab, setTab] = useState<Tab>("bank");
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [sort, setSort] = useState<BankSort>("order");
  const [selected, setSelected] = useState<string | null>(null);
  const [cutting, setCutting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState("");

  const campaignId = active?.id ?? "";
  const vid = videoId ?? "";
  const clips = useMemo(() => (campaignId && vid ? clipsFor(data, campaignId, vid) : []), [data, campaignId, vid]);
  const known = useMemo(() => facets(data, campaignId), [data, campaignId]);
  const band = active
    ? { targetMinSec: active.targetMinSec, targetMaxSec: active.targetMaxSec, hardMaxSec: active.hardMaxSec }
    : null;

  // New video or campaign: filters and selection do not carry over.
  useEffect(() => {
    setSelected(null);
    setImporting(false);
    setNotice("");
    setSummary("");
  }, [campaignId, vid]);

  // Paint the plan on the timeline. syncVideo clears it on a video change, so reapply when it is empty.
  const planned = useMemo(() => bankedRanges(clips), [clips]);
  const appliedKey = useRef("");
  useEffect(() => {
    const key = JSON.stringify(planned);
    if (appliedKey.current !== key || seg.banked.length !== planned.length) {
      appliedKey.current = key;
      setBankedRanges(planned);
    }
  }, [planned, seg.banked.length, vid]);

  const visible = useMemo(
    () => sortClips(filterClips(clips, { text, categories: cats, tiers }), sort),
    [clips, text, cats, tiers, sort],
  );
  const filtering = Boolean(text.trim() || cats.length || tiers.length);
  const cutCount = clips.filter((c) => c.status !== "banked").length;

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const load = useCallback(
    (clip: BankedClip) => {
      setSelected(clip.id);
      seg.load(clip.segments);
    },
    [seg],
  );

  const cut = useCallback(
    async (clip: BankedClip) => {
      if (!onCutBanked || !campaignId || !vid) return;
      setCutting(clip.id);
      setNotice("");
      try {
        const ok = await onCutBanked(clip);
        if (ok) {
          const res = bankStore.markCut(campaignId, vid, clip.id);
          if (res) recordUse(vid, res.ranges, clip.id);
        } else {
          setNotice(`${clip.id} was not cut. It stays in the bank.`);
        }
      } catch {
        setNotice(`${clip.id} was not cut. It stays in the bank.`);
      } finally {
        setCutting(null);
      }
    },
    [onCutBanked, campaignId, vid, recordUse],
  );

  const doImport = (parsed: ParsedClip[]) => {
    const r = bankStore.importClips(campaignId, vid, parsed);
    const parts = [`${r.added} added`];
    if (r.updated) parts.push(`${r.updated} updated`);
    if (r.skipped) parts.push(`${r.skipped} already cut, left alone`);
    setSummary(parts.join(", "));
    setImporting(false);
    setTab("bank");
  };

  // ---- This video: cut clips, plus anything the campaign recorded as used that is not in the bank.
  const usedGroups = useMemo(() => {
    if (!vid || !active) return [];
    const inBank = new Set(clips.map((c) => c.id));
    const groups = new Map<string, BankedClip>();
    for (const u of usedFor(vid)) {
      if (inBank.has(u.clipId)) continue;
      const g = groups.get(u.clipId) ?? { id: u.clipId, label: "", segments: [], status: "cut" as const };
      g.segments.push({ start: u.start, end: u.end });
      groups.set(u.clipId, g);
    }
    return [...groups.values()];
  }, [vid, active, clips, usedFor]);

  const thisVideoRows = useMemo(
    () => [...clips.filter((c) => c.status !== "banked"), ...usedGroups],
    [clips, usedGroups],
  );

  const renderRow = (clip: BankedClip, opts: { fromBank: boolean }) => {
    const total = clipLength(clip);
    const b = clipBand(clip, band);
    const isSel = selected === clip.id;
    const bandText =
      b.status === "in"
        ? "In band"
        : b.status === "under"
          ? `${formatLength(b.deltaSec)} under`
          : b.status === "over"
            ? `${formatLength(b.deltaSec)} over`
            : b.status === "over-hard"
              ? `${formatLength(b.deltaSec)} past the cap`
              : "";
    const outOfBand = b.status === "under" || b.status === "over" || b.status === "over-hard";
    return (
      <li key={clip.id}>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={isSel}
          onClick={() => load(clip)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              load(clip);
            }
          }}
          className="flex cursor-pointer gap-3 rounded-control border bg-raised px-3 py-2 outline-none hover:bg-hover focus-visible:border-accent"
          style={{ borderColor: isSel ? "var(--accent)" : "var(--c-hairline)" }}
        >
          <StatusDot status={clip.status} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <RangeLines clip={clip} />
              <span className="shrink-0 font-mono text-body text-fg" style={MONO}>
                {formatLength(total)}
              </span>
            </div>
            <span className="truncate text-body text-fg">
              <span className="font-mono text-meta text-fg-dim">{clip.id}</span>
              {clip.label ? ` ${clip.label}` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {clip.category && <span className="chip">{clip.category}</span>}
              {clip.tier && <span className="chip">{tierText(clip.tier)}</span>}
              {bandText && (
                <span className={`chip ${outOfBand ? "text-accent" : ""}`} title="Length against the campaign band">
                  {bandText}
                </span>
              )}
              <span className="text-meta text-fg-dim">{clip.status}</span>
            </div>
            {opts.fromBank && (
              <div className="flex items-center gap-1 pt-1">
                {clip.status === "banked" && (
                  <button
                    type="button"
                    className="chip"
                    disabled={!onCutBanked || cutting !== null}
                    title={onCutBanked ? "Cut this clip as one file" : "Cutting is not connected yet"}
                    onClick={(e) => {
                      e.stopPropagation();
                      void cut(clip);
                    }}
                  >
                    {cutting === clip.id ? "Cutting" : "Cut"}
                  </button>
                )}
                {clip.status === "cut" && (
                  <button
                    type="button"
                    className="chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      bankStore.setStatus(campaignId, vid, clip.id, "published");
                    }}
                  >
                    Mark published
                  </button>
                )}
                <button
                  type="button"
                  className="chip"
                  aria-label={`Remove ${clip.id} from the bank`}
                  onClick={(e) => {
                    e.stopPropagation();
                    bankStore.remove(campaignId, vid, clip.id);
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </li>
    );
  };

  const needsCampaign = !active;
  const needsVideo = !vid;

  const importView = (
    <ImportTimestamps duration={duration || undefined} onImport={doImport} onCancel={() => setImporting(false)} />
  );

  const bankView = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search the bank"
          aria-label="Search the bank"
          className="field min-w-0 flex-1"
        />
        <button type="button" className="btn shrink-0" onClick={() => setImporting(true)}>
          Import timestamps
        </button>
      </div>

      {(known.categories.length > 0 || known.tiers.length > 0) && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filters">
          {known.categories.map((c) => (
            <button
              key={`c-${c}`}
              type="button"
              className="chip"
              aria-pressed={cats.includes(c)}
              style={cats.includes(c) ? { borderColor: "var(--accent)" } : undefined}
              onClick={() => toggle(cats, setCats, c)}
            >
              {c}
            </button>
          ))}
          {known.tiers.map((t) => (
            <button
              key={`t-${t}`}
              type="button"
              className="chip"
              aria-pressed={tiers.includes(t)}
              style={tiers.includes(t) ? { borderColor: "var(--accent)" } : undefined}
              onClick={() => toggle(tiers, setTiers, t)}
            >
              Tier {t}
            </button>
          ))}
          {(cats.length > 0 || tiers.length > 0) && (
            <button
              type="button"
              className="chip text-fg-dim"
              onClick={() => {
                setCats([]);
                setTiers([]);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-meta text-fg-dim">
        <span aria-live="polite">
          {filtering ? `${visible.length} of ${clips.length} clips` : `${clips.length} clips`}
          {cutCount ? `, ${cutCount} cut` : ""}
        </span>
        <button
          type="button"
          className="chip"
          aria-pressed={sort === "tier"}
          style={sort === "tier" ? { borderColor: "var(--accent)" } : undefined}
          onClick={() => setSort(sort === "tier" ? "order" : "tier")}
          title="Lowest tier first, untiered last"
        >
          Sort by tier
        </button>
      </div>

      {summary && <p className="text-meta text-fg-dim">Imported: {summary}.</p>}
      {notice && (
        <p role="alert" className="rounded-control border border-accent bg-accent-card px-3 py-2 text-meta text-accent">
          {notice}
        </p>
      )}

      {clips.length === 0 ? (
        <div className="rounded-control border border-dashed px-3 py-6 text-center text-body text-fg-dim" style={{ borderColor: "var(--c-hairline-strong)" }}>
          Nothing banked for this video. Import timestamps once and they stay here.
        </div>
      ) : visible.length === 0 ? (
        <p className="px-1 py-4 text-body text-fg-dim">No clips match those filters.</p>
      ) : (
        <ul className="flex flex-col gap-2">{visible.map((c) => renderRow(c, { fromBank: true }))}</ul>
      )}
    </div>
  );

  const videoView =
    thisVideoRows.length === 0 ? (
      <p className="px-1 py-4 text-body text-fg-dim">Nothing cut from this video yet.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {thisVideoRows.map((c) => renderRow(c, { fromBank: clips.some((x) => x.id === c.id) }))}
      </ul>
    );

  const gate = needsCampaign
    ? "Create a campaign to keep a bank. Banks are kept per campaign and per video."
    : needsVideo
      ? "Paste a link to see this video's clips."
      : "";

  // The importer needs a campaign and a video; the gate message covers the other tabs.
  const body =
    tab === "all" ? (
      <DownloadsPanel />
    ) : gate ? (
      <p className="px-1 py-4 text-body text-fg-dim">{gate}</p>
    ) : tab === "bank" ? (
      importing ? importView : bankView
    ) : (
      videoView
    );

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 ${className ?? ""}`}>
      <div role="tablist" aria-label="Clips" className="flex gap-1">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`clips-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="clips-panel"
            tabIndex={tab === t.id ? 0 : -1}
            className={`h-row rounded-control border px-3 text-body ${tab === t.id ? "bg-hover text-fg" : "text-fg-dim hover:text-fg"}`}
            style={{ borderColor: tab === t.id ? "var(--c-hairline-strong)" : "transparent" }}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
              setTab(TABS[next].id);
              tabRefs.current[next]?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="clips-panel" role="tabpanel" aria-labelledby={`clips-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {body}
      </div>
    </div>
  );
}
