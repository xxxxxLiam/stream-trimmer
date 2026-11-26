/**
 * File: potTokenProvider.ts
 * Path: src/main/features/engine/services/download/potTokenProvider.ts
 * Description: Runs a local PO (Proof of Origin) token provider as its own child process, so yt-dlp
 *   can mint tokens for clients YouTube gates behind one (see ytdlpOptions.ts) without any account
 *   sign-in. Never bundled into this app's own process or source tree: `vendorEntryPoint()` only
 *   finds it if `npm run tools:refresh-pot` (see scripts/bundle-binaries.cjs) has cloned, built and
 *   copied it into the gitignored `resources/pot-provider/` folder (its build output plus its own
 *   node_modules — it is not one self-contained file), which this app never ships until that step
 *   has been run on the target platform and the licence question (GPL-3.0; see
 *   docs/pot-provider.md) has been cleared. Until then every function here reports "not available"
 *   and the download path falls back to the token-free client list exactly as before this file
 *   existed.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { BIN_DIR, childEnv } from "../binaries";

/**
 * Where `tools:refresh-pot` places the built provider; never committed (see .gitignore). Packaged:
 * `<resources>/pot-provider`, alongside `bin/` — the same base `binaries.ts` resolves yt-dlp from,
 * because `process.cwd()` is not the app folder once packaged. Dev: the repo's own `resources/`.
 */
export function vendorDir(): string {
  return process.env.ELECTRON_RESOURCES
    ? path.join(process.env.ELECTRON_RESOURCES, "pot-provider")
    : path.join(process.cwd(), "resources", "pot-provider");
}

/**
 * The built server entry point, or null when `tools:refresh-pot` has not vendored one. Pure given a
 * reader. The provider is not one self-contained file: `build/main.js` imports sibling files in the
 * same `build/` folder and, via plain Node-style specifiers (`express`, `commander`, ...), the
 * `node_modules` vendored beside it — both have to be present, not just the entry file.
 */
export function vendorEntryPoint(dir: string, exists: (p: string) => boolean = fs.existsSync): string | null {
  const entry = path.join(dir, "build", "main.js");
  return exists(entry) && exists(path.join(dir, "node_modules")) ? entry : null;
}

/** The runtime used to execute the vendored server: Deno is already bundled for yt-dlp's own JS challenge solving. */
export function runtimeBinary(): string | null {
  if (!BIN_DIR) return null;
  const exe = path.join(BIN_DIR, process.platform === "win32" ? "deno.exe" : "deno");
  return fs.existsSync(exe) ? exe : null;
}

/** The yt-dlp `--extractor-args` value(s) for a client list, with the provider's base URL appended when it is running. */
export function extractorArgsFor(clients: string, potBaseUrl?: string | null): string[] {
  return potBaseUrl ? [clients, `youtubepot-bgutilhttp:base_url=${potBaseUrl}`] : [clients];
}

export interface PotProviderHandle {
  baseUrl: string;
  stop: () => void;
}

interface StartDeps {
  entry: string | null;
  runtime: string | null;
  /** Spawns the server; split out so tests never actually fork a process. */
  spawnServer: (runtime: string, entry: string, port: number, env: NodeJS.ProcessEnv) => ChildProcess;
  /** Resolves once something is listening on `port`, or rejects on timeout. */
  waitUntilListening: (port: number, timeoutMs: number) => Promise<void>;
  /** An unused loopback port. */
  pickPort: () => Promise<number>;
}

/** One attempt to start the provider. Null, never a throw, when it is not vendored or fails to come up. */
export async function startPotProvider(deps: StartDeps): Promise<PotProviderHandle | null> {
  if (!deps.entry || !deps.runtime) return null;
  const port = await deps.pickPort();
  const child = deps.spawnServer(deps.runtime, deps.entry, port, childEnv());
  try {
    await deps.waitUntilListening(port, 10_000);
  } catch {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    return null;
  }
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

function waitUntilListening(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() >= deadline) reject(new Error("pot provider did not start listening"));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

function spawnServer(runtime: string, entry: string, port: number, env: NodeJS.ProcessEnv): ChildProcess {
  // Takes its port and host as CLI flags, not a PORT env var (confirmed by actually running the
  // vendored build — see docs/pot-provider.md). `--host 127.0.0.1` is explicit and not merely the
  // provider's own default: the server is unauthenticated, so it must never be reachable from
  // anything but this machine.
  return spawn(
    runtime,
    ["run", "--allow-net", "--allow-env", "--allow-read", entry, "--port", String(port), "--host", "127.0.0.1"],
    {
      env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

let cached: Promise<PotProviderHandle | null> | null = null;

/** The running provider's base URL, starting it on first call and reusing it after. Null when unavailable. */
export function potBaseUrl(): Promise<string | null> {
  cached ??= startPotProvider({
    entry: vendorEntryPoint(vendorDir()),
    runtime: runtimeBinary(),
    spawnServer,
    waitUntilListening,
    pickPort,
  });
  return cached.then((h) => h?.baseUrl ?? null);
}

/** Test-only: forgets the cached provider so the next `potBaseUrl()` call starts fresh. */
export function resetPotProviderForTests(): void {
  cached = null;
}
