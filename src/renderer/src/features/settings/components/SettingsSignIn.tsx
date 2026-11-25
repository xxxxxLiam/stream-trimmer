/**
 * File: SettingsSignIn.tsx
 * Path: src/renderer/src/features/settings/components/SettingsSignIn.tsx
 * Description: Settings > Sign in for 1080p (late decision, signin-open.png B; moved out of Help, Liam 25 Nov): the honest line first,
 *   three steps, and a drop zone "Drop cookies.txt, or choose a file". A refused file says why in
 *   error red, then the fix, under the drop zone. No dialog, toast or Try again button.
 */
import { useState, type DragEvent } from "react";
import { DrawerHeader, drawerBodyRoomy, outlineButton } from "../../../shared/components/DrawerRows";
import type { CookieReason } from "../utils/cookieReasons";

export type SettingsSignInProps = {
  problem: CookieReason | null;
  done: boolean;
  onFile: (file: File | undefined) => void;
  onChoose: () => void;
  onBack: () => void;
  onClose: () => void;
};

const STEPS = [
  "Sign in to YouTube in Chrome, Edge, Firefox or Brave.",
  "Install the “Get cookies.txt LOCALLY” extension and export the cookies for youtube.com.",
  "Drop the file here.",
];

export default function SettingsSignIn(p: SettingsSignInProps) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    p.onFile(e.dataTransfer.files?.[0]);
  };
  return (
    <>
      <DrawerHeader title="Sign in for 1080p" back="Settings" onBack={p.onBack} closeName="Settings" onClose={p.onClose} />
      <div className={drawerBodyRoomy}>
        <p className="m-[0px] text-body">Clipr only reads your sign-in to download. It never posts, likes or changes anything.</p>
        <ol className="m-[0px] flex list-none flex-col gap-[8px] p-[0px]">
          {STEPS.map((t, i) => (
            <li key={t} className="flex gap-[12px] text-body">
              <span className="flex size-[24px] flex-none items-center justify-center rounded-full border border-hairlineStrong text-meta text-fg-dim">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[96px] flex-col items-center justify-center gap-[8px] rounded-control border border-dashed p-[16px] text-center text-body ${over ? "border-ice bg-ice-tint-08" : "border-hairlineStrong bg-raised"}`}
        >
          <span>Drop cookies.txt, or choose a file</span>
          <button type="button" aria-label="Choose a cookies file" onClick={p.onChoose} className={outlineButton}>Choose a file</button>
        </div>
        {p.problem && (
          <div role="alert" className="flex flex-col gap-[4px]">
            <span className="text-body text-error">{p.problem.reason}</span>
            <span className="text-body text-fg">{p.problem.fix}</span>
          </div>
        )}
        {p.done && <div role="status" className="text-body text-fg-dim">Signed in. Clips will come down at full quality.</div>}
      </div>
    </>
  );
}
