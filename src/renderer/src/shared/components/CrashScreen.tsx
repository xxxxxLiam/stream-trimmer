/**
 * File: CrashScreen.tsx
 * Path: src/renderer/src/shared/components/CrashScreen.tsx
 * Description: What the window shows after a render crash (decisions: reopen where you were, a one-line
 *   note, Copy details, Send report). No error text appears here; it goes into the details. Pressing Send
 *   report is the consent. Logic-free: CrashScreenHost feeds it.
 */
import TitleBarDrag from "../../modules/layout/components/TitleBarDrag";

export type CrashScreenProps = {
  state: "idle" | "sent" | "kept";
  copied: boolean;
  onReopen: () => void;
  onSend: () => void;
  onCopy: () => void;
};

const secondary = "h-target rounded-control border border-hairlineStrong bg-raised px-[16px] text-body leading-[normal] text-fg hover:bg-hover";

export default function CrashScreen(p: CrashScreenProps) {
  return (
    <div role="alert" id="ui-crash" className="flex h-screen w-full items-center justify-center bg-bg p-[24px] text-fg">
      <TitleBarDrag />
      <div className="flex w-[480px] max-w-full flex-col gap-[16px] rounded-panel border border-hairline bg-panel p-[24px]">
        <h1 className="m-[0px] text-drawer-title font-medium">Clipr hit a problem</h1>
        <p className="m-[0px] text-body text-fg-dim">Your campaigns, clips and settings are saved. Reopen Clipr to carry on where you were.</p>
        {p.state === "idle" ? (
          <p className="m-[0px] text-meta text-fg-dim">
            Send a crash report? It includes the error, your app and system version, and recent activity with your name and file paths removed. Nothing is sent unless you press Send report.
          </p>
        ) : (
          <p role="status" className="m-[0px] text-body">{p.state === "sent" ? "Sent. Thank you." : "Saved. Clipr will send it when it can."}</p>
        )}
        <div className="flex flex-wrap gap-[8px]">
          <button type="button" id="ui-crash-reopen" onClick={p.onReopen} className="h-target rounded-control bg-ice px-[16px] text-body font-medium text-bg">
            Reopen Clipr
          </button>
          {p.state === "idle" && (
            <button type="button" id="ui-crash-send" onClick={p.onSend} className={secondary}>
              Send report
            </button>
          )}
          <button type="button" id="ui-crash-copy" onClick={p.onCopy} className={secondary}>
            {p.copied ? "Copied" : "Copy details"}
          </button>
        </div>
      </div>
    </div>
  );
}
