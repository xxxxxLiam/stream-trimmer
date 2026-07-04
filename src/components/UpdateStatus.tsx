/**
 * File: UpdateStatus.tsx
 * Path: src/components/UpdateStatus.tsx
 * Description: Compact auto-update indicator + manual check/restart controls.
 *   Only renders inside the packaged Electron app.
 */
import { useEffect, useState } from "react";

const RELEASES_URL = "https://github.com/xxxxxLiam/stream-trimmer/releases";

type Status = UpdateStatusPayload | { state: "idle" };

export default function UpdateStatus() {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    if (!api?.onUpdateStatus) return;
    const off = api.onUpdateStatus((payload) => setStatus(payload));
    return off;
  }, [api]);

  if (!api?.isElectron) return null;

  const handleCheck = async () => {
    setStatus({ state: "checking" });
    const res = await api.checkForUpdates();
    if (!res.ok && res.error) {
      setStatus({ state: "error", message: res.error });
    }
  };

  const handleRestart = () => {
    api.quitAndInstall();
  };

  let label: string | null = null;
  let action: { text: string; onClick: () => void } | null = null;
  let href: string | null = null;

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
    case "ready":
      label = `Update ready${status.version ? ` (v${status.version})` : ""}`;
      action = { text: "Restart", onClick: handleRestart };
      break;
    case "error":
      label = "Update check failed";
      href = RELEASES_URL;
      break;
    case "none":
    case "idle":
    default:
      label = null;
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-faint">
      {label && (
        <span
          className="rounded-row bg-panel-hover px-2 py-1 text-fg-muted"
          style={{ backgroundColor: "#161618" }}
        >
          {label}
        </span>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-row px-2 py-1 text-fg"
          style={{ backgroundColor: "#FF6363", color: "#0B0B0C" }}
        >
          {action.text}
        </button>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-fg"
        >
          Download manually
        </a>
      )}
      <button
        type="button"
        onClick={handleCheck}
        className="rounded-row px-2 py-1 hover:text-fg"
        title="Check for updates"
      >
        Check
      </button>
    </div>
  );
}