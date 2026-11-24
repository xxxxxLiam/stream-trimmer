/**
 * File: editorDiscoveryWin.ts
 * Path: src/main/features/editor/services/editorDiscoveryWin.ts
 * Description: Finds installed video editors on Windows as pure functions (the registry reader and the
 *   file system are passed in, so no Windows machine is needed to test them). The registry "App Paths"
 *   entry wins, then the known install folders, newest Premiere year first. Final Cut Pro is Mac-only
 *   and is never found here. Every location below is from the handoff plan and is NOT verified on a
 *   real Windows machine yet.
 */
import path from "node:path";

export type WinEditorKey = "premiere" | "resolve" | "capcut";

interface FsLike {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
}

export interface WinEnv {
  ProgramFiles?: string;
  "ProgramFiles(x86)"?: string;
  LOCALAPPDATA?: string;
}

export interface WinDeps {
  fsImpl: FsLike;
  env: WinEnv;
  /** Default value of a registry key, or null. Keys look like `HKLM\SOFTWARE\...\App Paths\Resolve.exe`. */
  readRegistry: (key: string) => string | null;
}

const APP_PATHS = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths";

const EXE: Record<WinEditorKey, string> = {
  premiere: "Adobe Premiere Pro.exe",
  resolve: "Resolve.exe",
  capcut: "CapCut.exe",
};

const win = path.win32;

/** Highest number wins, so "2025" beats "2024" and "10" beats "9". */
const byVersionDesc = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

function fromRegistry(exe: string, d: WinDeps): string | null {
  for (const hive of ["HKLM", "HKCU"]) {
    const value = d.readRegistry(`${hive}\\${APP_PATHS}\\${exe}`);
    // Registry values are sometimes quoted.
    const p = value?.replace(/^"(.*)"$/, "$1").trim();
    if (p && win.isAbsolute(p) && d.fsImpl.existsSync(p)) return p;
  }
  return null;
}

function programFilesDirs(env: WinEnv): string[] {
  return [env.ProgramFiles, env["ProgramFiles(x86)"]].filter((d): d is string => !!d);
}

function fromFolders(key: WinEditorKey, d: WinDeps): string | null {
  const exe = EXE[key];
  const candidates: string[] = [];
  if (key === "premiere") {
    // "Adobe\Adobe Premiere Pro 2025\Adobe Premiere Pro.exe", newest year first.
    for (const pf of programFilesDirs(d.env)) {
      const adobe = win.join(pf, "Adobe");
      let names: string[] = [];
      try {
        names = d.fsImpl.readdirSync(adobe);
      } catch {
        /* no Adobe folder here */
      }
      for (const name of names.filter((n) => /^Adobe Premiere Pro/.test(n)).sort(byVersionDesc)) {
        candidates.push(win.join(adobe, name, exe));
      }
    }
  } else if (key === "resolve") {
    for (const pf of programFilesDirs(d.env)) candidates.push(win.join(pf, "Blackmagic Design", "DaVinci Resolve", exe));
  } else if (d.env.LOCALAPPDATA) {
    candidates.push(win.join(d.env.LOCALAPPDATA, "CapCut", "Apps", exe));
  }
  return candidates.find((c) => d.fsImpl.existsSync(c)) ?? null;
}

/** Absolute path of an installed editor's .exe on Windows, or null. */
export function findWindowsEditor(key: string, d: WinDeps): string | null {
  if (!(key in EXE)) return null; // finalcut and anything else: not on Windows
  const k = key as WinEditorKey;
  return fromRegistry(EXE[k], d) ?? fromFolders(k, d);
}

/** Where discovery looks, for the plain "not installed" message. */
export const WINDOWS_SEARCH_PLACES = "the registry and Program Files";
