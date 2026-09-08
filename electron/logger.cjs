// electron/logger.cjs — tiny append-only diagnostic log for the desktop app.
//
// Writes to <userData>/logs/main.log, rotating at ~1MB so the file can never
// grow without bound. Only event names and error messages are recorded —
// never cookies, tokens, URLs with credentials, or any personal data.
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const MAX_BYTES = 1024 * 1024;

let logFile = null;

function resolveLogFile() {
  if (logFile) return logFile;
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, "main.log");
  } catch {
    logFile = null;
  }
  return logFile;
}

/** Absolute path of the diagnostic log, or null if it could not be created. */
function logFilePath() {
  return resolveLogFile();
}

/** Last `lines` lines of the log, for the in-app diagnostics view. */
function tail(lines = 400) {
  const target = resolveLogFile();
  if (!target) return "";
  try {
    const text = fs.readFileSync(target, "utf8");
    const all = text.split(/\r?\n/);
    return all.slice(Math.max(0, all.length - lines)).join("\n");
  } catch {
    return "";
  }
}

function rotate(target) {
  try {
    const { size } = fs.statSync(target);
    if (size < MAX_BYTES) return;
    fs.renameSync(target, `${target}.1`);
  } catch {
    /* first write, or rotation not possible — keep going */
  }
}

/** Appends one timestamped line. Never throws. */
function log(scope, message) {
  const line = `${new Date().toISOString()} [${scope}] ${message}`;
  // Keep console output too — useful when run from a terminal.
  console.log(line);
  const target = resolveLogFile();
  if (!target) return;
  try {
    rotate(target);
    fs.appendFileSync(target, `${line}\n`);
  } catch {
    /* logging must never break the app */
  }
}

function describe(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err.stack) return String(err.stack).split("\n").slice(0, 4).join(" | ");
  return err.message ? err.message : String(err);
}

/**
 * Registers global crash listeners. Called once, as early as possible, so a
 * failure anywhere leaves a trace instead of a silently vanishing app.
 */
function installCrashHandlers() {
  process.on("uncaughtException", (err) => {
    log("crash", `uncaughtException: ${describe(err)}`);
  });
  process.on("unhandledRejection", (reason) => {
    log("crash", `unhandledRejection: ${describe(reason)}`);
  });
  app.on("render-process-gone", (_event, _contents, details) => {
    log(
      "crash",
      `render-process-gone reason=${details && details.reason} exitCode=${details && details.exitCode}`,
    );
  });
  app.on("child-process-gone", (_event, details) => {
    log(
      "crash",
      `child-process-gone type=${details && details.type} reason=${details && details.reason}`,
    );
  });
  app.on("gpu-process-crashed", (_event, killed) => {
    log("crash", `gpu-process-crashed killed=${killed}`);
  });
  // Distinguishes "the app decided to quit" from "the app was killed". Without
  // these, a self-inflicted quit and a hard crash look identical in the log.
  app.on("before-quit", () => log("app", "before-quit"));
  app.on("will-quit", () => log("app", "will-quit"));
  app.on("quit", (_e, code) => log("app", `quit exitCode=${code}`));
  app.on("window-all-closed", () => log("app", "window-all-closed"));
  process.on("exit", (code) => log("app", `process exit code=${code}`));
  process.on("SIGTERM", () => log("app", "received SIGTERM"));
  log(
    "app",
    `crash handlers installed pid=${process.pid} electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node} platform=${process.platform}`,
  );
}

/** Attaches per-window diagnostics (unresponsive / renderer death). */
function watchWindow(name, win) {
  if (!win || win.isDestroyed()) return;
  win.on("unresponsive", () => log("window", `${name} unresponsive`));
  win.on("responsive", () => log("window", `${name} responsive again`));
  win.webContents.on("render-process-gone", (_e, details) => {
    log(
      "window",
      `${name} renderer gone reason=${details && details.reason}`,
    );
  });
}

module.exports = {
  log,
  watchWindow,
  installCrashHandlers,
  describe,
  logFilePath,
  tail,
};
