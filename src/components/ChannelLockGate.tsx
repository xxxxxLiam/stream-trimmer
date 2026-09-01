/**
 * File: ChannelLockGate.tsx
 * Path: src/components/ChannelLockGate.tsx
 * Description: Passcode unlock card guarding the channel exporter.
 */
import { useCallback, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { LockFill, UnlockFill } from "react-bootstrap-icons";
import {
  isUnlocked,
  rememberUnlock,
  verifyPasscode,
} from "../lib/channelLock";

export default function ChannelLockGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setChecking(true);
      setError("");
      try {
        if (await verifyPasscode(passcode)) {
          rememberUnlock();
          setUnlocked(true);
          setPasscode("");
        } else {
          setError("That passcode doesn't match.");
        }
      } finally {
        setChecking(false);
      }
    },
    [passcode],
  );

  if (unlocked)
    return (
      <div className="flex flex-col gap-2">
        {children}
        <button
          type="button"
          onClick={() => {
            forgetUnlock();
            setUnlocked(false);
          }}
          className="inline-flex items-center gap-1.5 self-start text-[12px] text-fg-faint transition-colors hover:text-fg-muted"
        >
          <LockFill size={11} />
          Lock again
        </button>
      </div>
    );

  return (
    <motion.form
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-panel border border-hairline bg-panel-raised p-4"
    >
      <div className="flex items-center gap-2 text-[13px] text-fg">
        <LockFill size={13} className="text-fg-muted" />
        Channel exporter is locked
      </div>
      <p className="text-[12px] leading-relaxed text-fg-faint">
        Enter the passcode to unlock this feature on this machine. You only need
        to do this once per install.
      </p>
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        placeholder="Passcode"
        autoFocus
        className="w-full rounded-row border border-hairline bg-panel px-3 py-2 text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-accent"
      />
      {error ? (
        <span className="text-[12px] text-accent">{error}</span>
      ) : null}
      <button
        type="submit"
        disabled={checking || passcode.trim() === ""}
        className="inline-flex items-center gap-2 self-start rounded-row bg-accent px-3 py-2 text-[13px] text-white transition-opacity disabled:opacity-40"
      >
        <UnlockFill size={13} />
        {checking ? "Checking…" : "Unlock"}
      </button>
    </motion.form>
  );
}
