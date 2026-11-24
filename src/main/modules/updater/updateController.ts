/**
 * File: updateController.ts
 * Path: src/main/modules/updater/updateController.ts
 * Description: The app-update behaviour, with no electron import so it can be tested: the
 *   "Update automatically" switch, one updateReady event for the top-bar pill, and a restart that
 *   waits while a clip is being made. It never shows a dialog or an OS notification.
 */
import type { RestartToUpdateResult, UpdateReady } from "../../../common/types/updates";

/** The slice of electron-updater's autoUpdater this controller drives. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, cb: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateControllerDeps {
  updater: UpdaterLike;
  /** False on the unsigned Mac build: nothing downloads or installs in place. */
  canInstall: boolean;
  autoUpdate: () => boolean;
  activeClips: () => number;
  /** Pushes a status payload on the existing updater:status channel. */
  sendStatus: (payload: unknown) => void;
  sendReady: (payload: UpdateReady) => void;
  downloadUrl: (version: string) => string;
  releasesUrl: () => string;
  log: (message: string) => void;
}

export function createUpdateController(d: UpdateControllerDeps) {
  const { updater } = d;
  let ready: UpdateReady | null = null;

  /** Re-applied whenever the switch flips or a clip starts or stops. */
  function applyPolicy() {
    updater.autoDownload = d.canInstall && d.autoUpdate();
    // Installing on quit is held while a clip is being made.
    updater.autoInstallOnAppQuit = d.canInstall && d.activeClips() === 0;
  }

  function markReady(next: UpdateReady) {
    ready = next;
    d.sendReady(next);
  }

  function attach() {
    applyPolicy();
    d.log(`install in place: ${d.canInstall ? "yes" : "no (macOS is unsigned)"}; automatic: ${d.autoUpdate()}`);
    updater.on("checking-for-update", () => d.sendStatus({ state: "checking" }));
    updater.on("update-available", (info: any) => {
      const version = String(info?.version ?? "");
      d.log(`update available: ${version}`);
      if (!d.canInstall) {
        const url = d.downloadUrl(version);
        d.sendStatus({ state: "manual", version, url });
        markReady({ version, mode: "download", url });
        return;
      }
      d.sendStatus({ state: "available", version });
    });
    updater.on("update-not-available", () => d.sendStatus({ state: "none" }));
    updater.on("download-progress", (p: any) =>
      d.sendStatus({ state: "downloading", percent: Math.round(p?.percent ?? 0) }),
    );
    updater.on("update-downloaded", (info: any) => {
      const version = String(info?.version ?? "");
      d.sendStatus({ state: "ready", version });
      markReady({ version, mode: "restart" });
    });
    updater.on("error", (err: any) => {
      const message = err?.message || String(err);
      d.log(`error: ${message}`);
      d.sendStatus({ state: "error", message, url: d.releasesUrl() });
    });
  }

  return {
    attach,
    applyPolicy,
    pendingReady: () => ready,
    /** Quiet check; downloads only when the switch is on. */
    check: () => updater.checkForUpdates(),
    /** The switch changed: apply it, and fetch now if it was just turned on. */
    onAutoUpdateChanged() {
      applyPolicy();
      if (d.canInstall && d.autoUpdate() && !ready) void updater.checkForUpdates().catch(() => {});
    },
    restartToUpdate(): RestartToUpdateResult {
      if (!ready || ready.mode !== "restart") return { ok: false, reason: "nothing-ready" };
      if (d.activeClips() > 0) return { ok: false, reason: "busy" };
      try {
        updater.quitAndInstall();
        return { ok: true };
      } catch (err: any) {
        return { ok: false, reason: "failed", error: err?.message || "Install failed" };
      }
    },
  };
}

export type UpdateController = ReturnType<typeof createUpdateController>;
