// src/main/modules/logger/logger.ts — tiny append-only diagnostic log for the desktop app.
//
// Writes to <userData>/logs/main.log, rotating at ~1MB so the file can never
// grow without bound. Only event names and error messages are recorded —
// never cookies, tokens, URLs with credentials, or any personal data.
import electron from "electron";
const { app } = electron;
import path from "node:path";
import fs from "node:fs";

const MAX_BYTES = 1024 * 1024;
const MAX_LINE = 600;

// Captured before anything can wrap them, so log() never recurses through a
// patched console (see captureConsole below).
const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let logFile: any = null;

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

function rotate(target: any) {
  try {
    const { size } = fs.statSync(target);
    if (size < MAX_BYTES) return;
    fs.renameSync(target, `${target}.1`);
  } catch {
    /* first write, or rotation not possible — keep going */
  }
}

/** Appends one timestamped line. Never throws. */
function log(scope: any, message: any) {
  const text = String(message);
  const line = `${new Date().toISOString()} [${scope}] ${
    text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text
  }`;
  // Keep console output too — useful when run from a terminal.
  nativeConsole.log(line);
  writeLine(line);
}

/** Appends one already-formatted line. Never throws. */
function writeLine(line: any) {
  const target = resolveLogFile();
  if (!target) return;
  try {
    rotate(target);
    fs.appendFileSync(target, `${line}\n`);
  } catch {
    /* logging must never break the app */
  }
}

/**
 * Routes the bundled backend's console output into the same log file. The
 * backend runs in this process and its console goes nowhere in a packaged
 * app, so the reason yt-dlp rejected a session was previously invisible —
 * the one thing needed to explain a session that exists but will not verify.
 */
function captureConsole() {
  const forward = (level: any) => (...args: any[]) => {
    (nativeConsole as any)[level](...args);
    try {
      const text = args
        .map((a) => (typeof a === "string" ? a : describe(a)))
        .join(" ");
      if (text.trim()) writeLine(`${new Date().toISOString()} [${level}] ${
        text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text
      }`);
    } catch {
      /* capturing output must never break the app */
    }
  };
  console.log = forward("log");
  console.warn = forward("warn");
  console.error = forward("error");
}

function describe(err: any) {
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
  (app as any).on("gpu-process-crashed", (_event: any, killed: any) => {
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
function watchWindow(name: any, win: any) {
  if (!win || win.isDestroyed()) return;
  win.on("unresponsive", () => log("window", `${name} unresponsive`));
  win.on("responsive", () => log("window", `${name} responsive again`));
  win.webContents.on("render-process-gone", (_e: any, details: any) => {
    log(
      "window",
      `${name} renderer gone reason=${details && details.reason}`,
    );
  });
}

export {
  log,
  captureConsole,
  watchWindow,
  installCrashHandlers,
  describe,
  logFilePath,
  tail,
};
