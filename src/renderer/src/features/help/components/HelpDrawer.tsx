/**
 * File: HelpDrawer.tsx
 * Path: src/renderer/src/features/help/components/HelpDrawer.tsx
 * Description: The Help drawer (Help.dc.html 04.5): 440px on the right, the same pattern as
 *   Settings, nothing blocked while it is open. Views: Common questions and More, one answer,
 *   Keyboard shortcuts, Report a problem (with its kept-for-later state), and About. Sign-in lives in Settings, not here. Focus starts in the search field; Esc closes Help.
 */
import { useRef } from "react";
import { Drawer } from "../../../shared/components/Drawer";
import HelpAbout from "./HelpAbout";
import HelpAnswer from "./HelpAnswer";
import HelpReport from "./HelpReport";
import HelpShortcuts from "./HelpShortcuts";
import HelpTop from "./HelpTop";
import { useDrawerFocus } from "../../../shared/hooks/useDrawerFocus";
import { useHelpController } from "../hooks/useHelpController";
import { appVersion } from "../utils/appVersion";
import { stepsOf, type HelpAnswer as Answer } from "../utils/helpContent";
import type { TipStep } from "../../tips/utils/tipRegistry";

export type HelpDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** First-use tips: whether they are on, and replay for the open panel. */
  tips?: { on: boolean; onReplay: () => void; onShowMe: (steps: TipStep[]) => void };
};

/** An answer's steps as tip steps: only the ones that name a real control, in order. */
export function tourOf(a: Answer): TipStep[] {
  return stepsOf(a).flatMap((s) =>
    s.show
      ? [{ target: s.show.target, withText: s.show.withText, text: s.text, advanceOn: s.show.advance === "click" ? { click: "target" } : s.show.advance ? { keys: s.show.advance } : undefined }]
      : [],
  );
}

export default function HelpDrawer({ open, onClose, tips }: HelpDrawerProps) {
  const c = useHelpController({ open, onClose });
  const root = useRef<HTMLDivElement>(null);
  // F-4 and F-12: focus stays in the drawer while it is open, returns to the opener on close, and lands on the new view's heading.
  const onKeyDown = useDrawerFocus(root, open, c.view.kind === "answer" ? `answer:${c.view.id}` : c.view.kind, "#ui-help-button");
  if (!open) return null;
  const { view } = c;
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  let body;
  if (view.kind === "answer" && c.answer) {
    body = <HelpAnswer answer={c.answer} onBack={c.top} onClose={onClose} onShowMe={() => tips?.onShowMe(tourOf(c.answer!))} />;
  } else if (view.kind === "shortcuts") {
    body = <HelpShortcuts ctrl={!isMac} onBack={c.top} onClose={onClose} />;
  } else if (view.kind === "report") {
    body = (
      <HelpReport
        note={c.note}
        onNote={c.setNote}
        state={c.report.state}
        copied={c.report.copied}
        onSend={() => void c.sendReport()}
        onCopy={() => void c.report.copyDetails(c.note)}
        onBack={c.top}
        onClose={onClose}
      />
    );
  } else if (view.kind === "about") {
    body = <HelpAbout version={appVersion()} onBack={c.top} onClose={onClose} />;
  } else {
    body = (
      <HelpTop
        query={c.query}
        onQuery={c.setQuery}
        results={c.results}
        version={appVersion()}
        tipsOn={tips?.on ?? true}
        onOpenAnswer={c.openAnswer}
        onOpenMore={c.openMore}
        onReplayTips={tips?.onReplay ?? (() => {})}
        onClose={onClose}
      />
    );
  }

  return (
    <div id="ui-help-drawer" ref={root} onKeyDown={onKeyDown} className="absolute inset-y-0 right-0 z-30 max-w-full overflow-y-auto">
      <Drawer label="Help">{body}</Drawer>
    </div>
  );
}
