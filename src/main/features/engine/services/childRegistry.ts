/**
 * File: childRegistry.ts
 * Path: src/main/features/engine/services/childRegistry.ts
 * Description: Remembers the downloader and ffmpeg processes the engine started, in a small file, so a hard
 *   kill of the app (Task Manager "End task", a power cut, SIGKILL) cannot leave one running forever.
 *   They are stopped when the app quits, and any left from last time are stopped at the next start.
 *   The process check and the kill are injected so it is testable without real processes.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";

export interface ChildEntry {
  pid: number;
  /** The program's name (yt-dlp, ffmpeg), checked again before anything is stopped, so a reused pid is never hit. */
  name: string;
}

export interface ChildRegistryDeps {
  file: string;
  /** The name of the program running as `pid` (Linux cuts it to 15 characters), or null when nothing runs there. */
  commandOf: (pid: number) => Promise<string | null>;
  /** Stops `pid` and what it started. */
  kill: (pid: number) => void;
}

export function createChildRegistry(d: ChildRegistryDeps) {
  const read = (): ChildEntry[] => {
    try {
      const raw = JSON.parse(fs.readFileSync(d.file, "utf8"));
      return Array.isArray(raw)
        ? raw.filter((e): e is ChildEntry => !!e && Number.isInteger(e.pid) && e.pid > 1 && typeof e.name === "string")
        : [];
    } catch {
      return [];
    }
  };
  const write = (list: ChildEntry[]) => {
    try {
      fs.mkdirSync(path.dirname(d.file), { recursive: true });
      const tmp = `${d.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(list));
      fs.renameSync(tmp, d.file);
    } catch {
      /* a registry that cannot be written must never stop a download */
    }
  };

  return {
    add(pid: number, name: string): void {
      if (!Number.isInteger(pid) || pid <= 1) return;
      write([...read().filter((e) => e.pid !== pid), { pid, name }]);
    },
    remove(pid: number): void {
      const list = read();
      if (list.some((e) => e.pid === pid)) write(list.filter((e) => e.pid !== pid));
    },
    /** Stops every remembered process that is still the same program, and forgets them all. Returns how many were stopped. */
    async reap(): Promise<number> {
      const list = read();
      let stopped = 0;
      for (const e of list) {
        const cmd = await d.commandOf(e.pid).catch(() => null);
        if (cmd && cmd.toLowerCase().includes(e.name.toLowerCase().slice(0, 15))) {
          try {
            d.kill(e.pid);
            stopped += 1;
          } catch {
            /* already gone */
          }
        }
      }
      if (list.length) write([]);
      return stopped;
    },
    /** Stops everything remembered, without checking: this run started them. Used as the app quits. */
    stopAllNow(): void {
      for (const e of read()) {
        try {
          d.kill(e.pid);
        } catch {
          /* already gone */
        }
      }
      write([]);
    },
  };
}

// ---- the real thing -----------------------------------------------------------------------

function commandOf(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { windowsHide: true, timeout: 5000 }, (err, out) =>
        resolve(err || !/","/.test(out) ? null : out.trim()),
      );
    } else {
      execFile("ps", ["-p", String(pid), "-o", "comm="], { timeout: 5000 }, (err, out) => resolve(err || !out.trim() ? null : out.trim()));
    }
  });
}

function killPid(pid: number): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL"); // children are started detached, so each leads its own group
  } catch {
    process.kill(pid, "SIGKILL");
  }
}

let shared: ReturnType<typeof createChildRegistry> | null = null;
function registry() {
  const file = process.env.YT_CLIPPER_CHILDREN_FILE;
  if (!file) return null;
  if (!shared) {
    shared = createChildRegistry({ file, commandOf, kill: killPid });
    process.once("exit", () => shared?.stopAllNow());
  }
  return shared;
}

/** Remember a process the engine just started; forget it when it ends. */
export function rememberChild(child: ChildProcess): void {
  const reg = registry();
  const pid = child.pid;
  if (!reg || !pid) return;
  const name = path.basename(String(child.spawnfile || "")).replace(/\.exe$/i, "") || "yt-dlp";
  reg.add(pid, name);
  child.once("close", () => reg.remove(pid));
}

/** At start: stop what a hard-killed earlier run left behind. */
export async function reapOrphanedChildren(): Promise<number> {
  return (await registry()?.reap()) ?? 0;
}
