/**
 * File: UpdateStatus.tsx
 * Path: src/renderer/src/features/updates/components/UpdateStatus.tsx
 * Description: Compact auto-update indicator + manual check/restart controls.
 *   Only renders inside the packaged Electron app.
 */
import { useEffect, useRef, useState } from "react";

const RELEASES_URL =
  "https://github.com/xxxxxLiam/stream-trimmer/releases/latest";

type Status = UpdateStatusPayload | { state: "idle" };

export default function UpdateStatus() {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!api?.onUpdateStatus) return;
    const off = api.onUpdateStatus((payload) => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      setStatus(payload);
      // "Up to date" is worth saying, but not worth keeping on screen.
      if (payload.state === "none") {
        clearTimer.current = window.setTimeout(
          () => setStatus({ state: "idle" }),
          4000,
        );
      }
    });
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      off();
    };
  }, [api]);

  if (!api?.isElectron) return null;

  const handleCheck = async () => {
    setStatus({ state: "checking" });
    const res = await api.checkForUpdates();
    // The main process reports the outcome over onUpdateStatus, including
    // "nothing new" — this only covers a check that never got that far.
    if (!res.ok && res.error) {
      setStatus({ state: "error", message: res.error, url: RELEASES_URL });
    }
  };

  const handleRestart = () => {
    api.quitAndInstall();
  };

  let label: string | null = null;
  let detail: string | undefined;
  let action: { text: string; onClick: () => void } | null = null;
  let link: { text: string; href: string } | null = null;

  switch (status.state) {
    case "checking":
      label = "Checking for updates…";
      break;
    case "downloading":
      label = `Downloading update… ${status.percent}%`;
      break;
    case "available":
      label = `Downloading v${status.version ?? ""}…`;
      break;
    case "manual":
      // A real update exists; this build just cannot install it itself.
      label = `Update ${status.version ? `v${status.version} ` : ""}available`;
      detail =
        "Downloads the installer. This macOS build is unsigned and cannot replace itself.";
      link = {
        text: `Download v${status.version ?? ""}`.trim(),
        href: status.url,
      };
      break;
    case "ready":
      label = `Update ready${status.version ? ` (v${status.version})` : ""}`;
      action = { text: "Restart", onClick: handleRestart };
      break;
    case "none":
      label = "Up to date";
      break;
    case "error":
      label = "Update check failed";
      detail = status.message;
      link = { text: "Download update", href: status.url ?? RELEASES_URL };
      break;
    case "idle":
    default:
      label = null;
  }

  return (
    <div className="flex items-center gap-2 text-meta text-fg-dim">
      {label && (
        <span
          className="rounded-control bg-panel-hover px-2 py-1 text-fg-dim"
          style={{ backgroundColor: "#161618" }}
          title={detail}
        >
          {label}
        </span>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-control px-2 py-1 text-fg"
          style={{ backgroundColor: "#FF6363", color: "#0B0B0C" }}
        >
          {action.text}
        </button>
      )}
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          title={detail}
          className="rounded-control px-2 py-1 underline hover:text-fg"
          style={
            status.state === "manual"
              ? { backgroundColor: "#FF6363", color: "#0B0B0C" }
              : undefined
          }
        >
          {link.text}
        </a>
      )}
      <button
        type="button"
        onClick={handleCheck}
        className="rounded-control px-2 py-1 hover:text-fg"
        title="Check for updates"
      >
        Check
      </button>
    </div>
  );
}