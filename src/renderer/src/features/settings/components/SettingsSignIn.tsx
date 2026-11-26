/**
 * File: SettingsSignIn.tsx
 * Path: src/renderer/src/features/settings/components/SettingsSignIn.tsx
 * Description: Settings > Sign in for 1080p (late decision, signin-open.png B; moved out of Help, Liam 25 Nov): the honest line first,
 *   three steps, and a drop zone "Drop cookies.txt, or choose a file". A refused file says why in
 *   error red, then the fix, under the drop zone. No dialog, toast or Try again button.
 */
import { useState, type DragEvent } from "react";
import { DrawerHeader, drawerBodyRoomy, outlineButton } from "../../../shared/components/DrawerRows";
import { CheckCircleFill, Clock, ExclamationCircle } from "react-bootstrap-icons";
import PreparingLine from "../../player/components/PreparingLine";
import type { SignInStatus } from "../utils/signInStatus";

export type SettingsSignInProps = {
  /** The status card's state (board 04.6 option A); null before any file was dropped and nothing is saved. */
  status: SignInStatus | null;
  onFile: (file: File | undefined) => void;
  onChoose: () => void;
  onSignOut: () => void;
  onBack: () => void;
  onClose: () => void;
};

const STEPS = [
  "Sign in to YouTube in Chrome, Edge, Firefox or Brave.",
  "Install the “Get cookies.txt LOCALLY” extension and export the cookies for youtube.com.",
  "Drop the file here.",
];

const linkButton = "h-target bg-transparent p-[0px] text-body leading-[normal] text-fg underline underline-offset-2";

function StatusCard({ status }: { status: SignInStatus }) {
  const box = "relative flex flex-col gap-[4px] overflow-hidden rounded-control border bg-raised px-[16px] py-[12px]";
  if (status.state === "checking") {
    return (
      <div role="status" className={`${box} border-hairlineStrong pb-[16px]`}>
        <span className="text-body text-fg">Checking your file…</span>
        <PreparingLine />
      </div>
    );
  }
  if (status.state === "signed-in") {
    return (
      <div role="status" className={`${box} border-hairlineStrong flex-row items-start gap-[12px]`}>
        <CheckCircleFill size={16} aria-hidden="true" className="mt-[2px] shrink-0 text-ice" />
        <div className="flex flex-col gap-[4px]">
          <span className="text-body text-fg">{status.account ? `Signed in as ${status.account}` : "Signed in"}</span>
          <span className="text-meta text-fg-dim">{status.justChecked ? "1080p is on. Checked just now." : "1080p is on."}</span>
        </div>
      </div>
    );
  }
  if (status.state === "saved") {
    return (
      <div role="status" className={`${box} border-hairlineStrong flex-row items-start gap-[12px]`}>
        <Clock size={16} aria-hidden="true" className="mt-[2px] shrink-0 text-fg-dim" />
        <div className="flex flex-col gap-[4px]">
          <span className="text-body text-fg">Saved, not checked yet</span>
          <span className="text-meta text-fg-dim">YouTube didn’t answer. Clipr will check again when you download.</span>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className={`${box} border-error flex-row items-start gap-[12px]`}>
      <ExclamationCircle size={16} aria-hidden="true" className="mt-[2px] shrink-0 text-error" />
      <div className="flex flex-col gap-[4px]">
        <span className="text-body text-error">Couldn’t sign in</span>
        <span className="text-body text-fg">{status.reason}</span>
        {status.fix && <span className="text-body text-fg">{status.fix}</span>}
      </div>
    </div>
  );
}

export default function SettingsSignIn(p: SettingsSignInProps) {
  const [over, setOver] = useState(false);
  /** Signed in or saved (board 04.6.4): the steps and drop zone fold away, leaving the line, Replace file and Sign out. */
  const signedIn = p.status?.state === "signed-in" || p.status?.state === "saved";
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    p.onFile(e.dataTransfer.files?.[0]);
  };
  return (
    <>
      <DrawerHeader title="Sign in for 1080p" back="Settings" onBack={p.onBack} closeName="Settings" onClose={p.onClose} />
      <div className={drawerBodyRoomy}>
        {p.status && <StatusCard status={p.status} />}
        <p className="m-[0px] text-body text-fg-dim">Clipr only reads your sign-in to download. It never posts, likes or changes anything.</p>
        {signedIn ? (
          <div className="flex gap-[16px]">
            <button type="button" onClick={p.onChoose} className={linkButton}>Replace file</button>
            <button type="button" onClick={p.onSignOut} className={linkButton}>Sign out</button>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
