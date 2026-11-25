/**
 * File: HelpStepPicture.tsx
 * Path: src/renderer/src/features/help/components/HelpStepPicture.tsx
 * Description: The small picture under a Help step (Help.dc.html 04.5.2): the control the step names, drawn
 *   from the app's own parts at a small size, with an Ice ring on the part to use. Decorative, so it is hidden
 *   from screen readers; the step text says the same thing in words.
 */
import type { ReactNode } from "react";
import type { HelpPic } from "../utils/helpContent";

const ring = "outline outline-2 outline-offset-2 outline-ice";
const frame = "ml-[30px] mt-[8px] box-border flex items-center gap-[8px] rounded-control border border-hairline bg-bg p-[10px]";
const iconBtn = "inline-flex size-[36px] flex-none items-center justify-center rounded-control border border-hairlineStrong text-fg-dim";

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

function Picture({ pic }: { pic: HelpPic }) {
  switch (pic) {
    case "paste":
      return <span className={`flex h-[32px] flex-1 items-center rounded-[16px] border border-hairlineStrong bg-raised px-[12px] text-meta text-fg-dim ${ring}`}>Search or paste a link</span>;
    case "clip":
      return <span className={`inline-flex h-[32px] items-center rounded-control bg-ice px-[16px] text-meta font-medium text-bg ${ring}`}>Clip</span>;
    case "add-section":
      return <span className={`inline-flex h-[32px] items-center rounded-control border border-hairlineStrong bg-raised px-[12px] text-meta text-fg ${ring}`}>+ section</span>;
    case "history":
      return (
        <span className="flex items-center gap-[14px] text-meta text-fg-dim">
          <span>Export</span>
          <span className={`rounded-chip px-[6px] py-[2px] text-fg ${ring}`}>History</span>
        </span>
      );
    case "row-folder":
      return (
        <div className="flex min-w-[0px] flex-1 items-center gap-[6px] rounded-control bg-raised py-[6px] pl-[8px] pr-[6px]">
          <span className="h-[26px] w-[40px] flex-none rounded-chip bg-hover" />
          <div className="min-w-[0px] flex-1">
            <div className="truncate text-body font-medium">Honest Version</div>
            <div className="mt-[2px] truncate text-meta text-fg-dim">0:42 · Acme · 09:12</div>
          </div>
          <span className="flex flex-none gap-[2px]">
            <span className={iconBtn}><Icon d={<path d="M5 11l6-6M6 5h5v5" />} /></span>
            <span className={`${iconBtn} ${ring}`}><Icon d={<path d="M2 5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />} /></span>
            <span className={iconBtn}><Icon d={<><rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M6 14h4M8 11v3" /></>} /></span>
          </span>
        </div>
      );
    case "audio":
      return <span className={`inline-flex h-[32px] items-center rounded-control border border-hairlineStrong bg-raised px-[12px] text-meta text-fg ${ring}`}>Original + ES</span>;
    case "languages":
      return (
        <span className="flex flex-col gap-[6px] text-meta">
          {[["Original", true], ["English", false], ["Spanish", true], ["Auto-dubbed", false]].map(([name, on]) => (
            <span key={String(name)} className="flex items-center gap-[8px] text-fg">
              <span className={`inline-flex size-[14px] items-center justify-center rounded-chip border ${on ? "border-ice bg-ice text-bg" : "border-hairlineStrong"}`}>{on ? <Icon d={<path d="M3.5 8.5l3 3 6-7" />} /> : null}</span>
              {name}
            </span>
          ))}
        </span>
      );
    case "clip-arrow":
      return (
        <span className="inline-flex items-center gap-[2px]">
          <span className="inline-flex h-[32px] items-center rounded-l-control bg-ice px-[16px] text-meta font-medium text-bg">Clip</span>
          <span className={`inline-flex h-[32px] w-[28px] items-center justify-center rounded-r-control bg-ice text-bg ${ring}`}><Icon d={<path d="M4 6l4 4 4-4" />} /></span>
        </span>
      );
    case "final-cut":
      return (
        <span className="flex items-center gap-[8px] text-meta text-fg">
          <span className={`inline-flex size-[14px] items-center justify-center rounded-chip bg-ice text-bg ${ring}`}><Icon d={<path d="M3.5 8.5l3 3 6-7" />} /></span>
          Final Cut Pro
        </span>
      );
  }
}

export default function HelpStepPicture({ pic }: { pic: HelpPic }) {
  return (
    <div aria-hidden="true" className={frame}>
      <Picture pic={pic} />
    </div>
  );
}
