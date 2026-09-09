/**
 * File: ConnectProgress.tsx
 * Path: src/components/ConnectProgress.tsx
 * Description: Progress readout for an in-flight YouTube sign-in. Verification
 * runs a real check against YouTube and can take the better part of a minute,
 * so the wait is shown as a stage with an elapsed time rather than a spinner
 * that gives no sign of life.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircleFill } from "react-bootstrap-icons";
import { useYouTubeConnection } from "../lib/youtubeConnection";

/** Ticks once a second while a verification is running. */
function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export default function ConnectProgress() {
  const { busy, step, phase, verifyStartedAt } = useYouTubeConnection();
  const elapsed = useElapsedSeconds(verifyStartedAt);

  if (!busy && phase !== "verified") return null;
  if (!step) return null;

  const verifying = phase === "verifying";
  const done = phase === "verified";

  return (
    <div
      className="mt-4 rounded-chip border border-hairline bg-bg-deep/40 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircleFill className="shrink-0 text-emerald-400" size={12} />
        ) : (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
          />
        )}
        <span className="min-w-0 flex-1 text-[12px] text-fg-muted">{step}</span>
        {verifying ? (
          <span className="shrink-0 tabular-nums text-[11px] text-fg-faint">
            {elapsed}s
          </span>
        ) : null}
      </div>

      {/* Indeterminate: the check gives no percentage, so never fake one. */}
      {!done ? (
        <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-panel-raised">
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      ) : null}

      {verifying ? (
        <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          Asking YouTube to confirm the session. The first check after signing
          in is the slow one — up to about a minute. You can leave this open.
        </p>
      ) : null}
    </div>
  );
}
