/**
 * File: updateController.ts
 * Path: src/main/modules/updater/updateController.ts
 * Description: The app-update behaviour, with no electron import so it can be tested: the
 *   "Update automatically" switch, one updateReady event for the top-bar pill, and a restart that
 *   waits while a clip is being made. Pressing Restart to update during a clip arms a deferred restart: Clipr
 *   restarts by itself once the clips are finished (after a short idle, so a queue is not cut between clips),
 *   and the renderer can cancel the wait. It never shows a dialog or an OS notification.
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
  /** Tells the pill the deferred restart was armed (true) or ended, by cancel or by restarting (false). */
  sendRestartWaiting: (waiting: boolean) => void;
  /** Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  downloadUrl: (version: string) => string;
  releasesUrl: () => string;
  log: (message: string) => void;
}

/** How long the clips must stay finished before a waiting restart goes ahead, so a queue is not cut between clips. */
export const RESTART_IDLE_MS = 2000;

export function createUpdateController(d: UpdateControllerDeps) {
  const { updater } = d;
  let ready: UpdateReady | null = null;
  let waiting = false;
  let idleTimer: unknown = null;
  const setTimer = d.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = d.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  function stopIdleTimer() {
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
  }

  function setWaiting(next: boolean) {
    if (waiting === next) return;
    waiting = next;
    if (!next) stopIdleTimer();
    d.sendRestartWaiting(next);
  }

  function installNow(): RestartToUpdateResult {
    try {
      updater.quitAndInstall();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, reason: "failed", error: err?.message || "Install failed" };
    }
  }

  /** While a restart waits: restart once no clip has been made for RESTART_IDLE_MS; a new clip restarts the wait. */
  function checkWaiting() {
    if (!waiting) return;
    if (d.activeClips() > 0) {
      stopIdleTimer();
      return;
    }
    if (idleTimer !== null) return;
    idleTimer = setTimer(() => {
      idleTimer = null;
      if (!waiting || d.activeClips() > 0) return;
      setWaiting(false);
      const r = installNow();
      if (!r.ok) d.log(`deferred restart failed: ${r.error ?? r.reason}`);
    }, RESTART_IDLE_MS);
  }

  /** Re-applied whenever the switch flips or a clip starts or stops. */
  function applyPolicy() {
    updater.autoDownload = d.canInstall && d.autoUpdate();
    // Installing on quit is held while a clip is being made.
    updater.autoInstallOnAppQuit = d.canInstall && d.activeClips() === 0;
    checkWaiting();
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
      // A build that cannot install (macOS, unsigned) never offers Restart to update, even if a download slipped through.
      if (!d.canInstall) return;
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
    /** True while a restart is armed and waiting for the clips to finish. */
    restartWaiting: () => waiting,
    /**
     * Restarts now when no clip is being made. During a clip it arms the deferred restart instead and answers
     * `{ ok: true, waiting: true }`; asking again while armed changes nothing.
     */
    restartToUpdate(): RestartToUpdateResult {
      if (!ready || ready.mode !== "restart") return { ok: false, reason: "nothing-ready" };
      if (d.activeClips() > 0) {
        setWaiting(true);
        checkWaiting();
        return { ok: true, waiting: true };
      }
      setWaiting(false);
      return installNow();
    },
    /** Ends the wait; the update still installs when the user quits. Returns whether a wait was ended. */
    cancelRestart(): boolean {
      const was = waiting;
      setWaiting(false);
      return was;
    },
  };
}

export type UpdateController = ReturnType<typeof createUpdateController>;
