/**
 * File: youtubeAuthProbe.ts
 * Path: src/main/features/engine/services/youtubeAuthProbe.ts
 * Description: Probes whether yt-dlp can find YouTube account cookies in one selected browser.
 */
import { type ChildProcess } from "node:child_process";
import { z } from "zod";
import { AUTH_PROBE_URLS, classifyYouTubeAuthOutput, type YouTubeAuthProbeStatus } from "../utils/youtubeAuth";
import { childEnv, yt } from "./binaries";
import { cookieBrowserSchema } from "../utils/schemas";

// Probe whether yt-dlp can find YouTube account cookies in one explicitly
// selected browser. YouTube does not redirect back to this local app, so this
// checks the browser cookie store directly and returns only sanitized status.
type CookieBrowserName = z.infer<typeof cookieBrowserSchema>;

// A full yt-dlp extraction can involve a JS challenge solved through the
// bundled deno, which comfortably exceeds 15s on a cold run or a slow link.
// Timing out there reports a perfectly good session as unverified, so the
// ceiling sits well above the slow case; callers cap themselves above this.
const AUTH_PROBE_TIMEOUT_MS = 40_000;
type AuthSourceName = CookieBrowserName | "app";

export function authProbeMessage(
  source: AuthSourceName,
  status: YouTubeAuthProbeStatus,
): string | undefined {
  if (source === "app") {
    if (status === "signed_in") return undefined;
    if (status === "probe_unavailable")
      return "YouTube wouldn't play any of the videos used to check the connection. Your sign-in is probably fine — try again in a moment.";
    if (status === "rate_limited")
      return "YouTube is rate-limiting this network, not rejecting your sign-in. Wait a few minutes and try again — re-importing cookies won't help.";
    if (status === "inconclusive")
      return undefined;
    if (status === "signed_out")
      return "Your saved YouTube sign-in has expired. Sign in again, or import a fresh cookies.txt.";
    if (status === "timeout")
      return "YouTube took too long to answer. Try again.";
    return "YouTube rejected the saved sign-in. Sign in again.";
  }
  if (status === "probe_unavailable")
    return "YouTube wouldn't play any of the videos used to check the connection, so this says nothing about your sign-in. Try again in a moment.";
  if (status === "rate_limited")
    return "YouTube is rate-limiting this network, not rejecting your sign-in. Wait a few minutes and try again.";
  if (status === "inconclusive") return undefined;
  const label = source[0].toUpperCase() + source.slice(1);
  if (status === "signed_out")
    return `No YouTube account cookies were found in ${label}.`;
  if (status === "profile_missing")
    return `No ${label} profile was found on this computer.`;
  if (status === "locked")
    return `${label} is running and holding its cookie database open. Fully quit it — including background tasks in the system tray — then check again. If that doesn't work, import a cookies.txt instead.`;
  if (status === "decrypt_failed")
    // Chrome 127+ ties the cookie key to the browser itself (App-Bound
    // Encryption on Windows, the keychain on macOS), so no other process can
    // decrypt them. This one cannot be worked around — it has to be routed
    // around, and the in-app window is NOT the alternative on Windows because
    // Google refuses sign-in from inside an app.
    return `${label} encrypts its cookies so other apps can't read them, and that can't be bypassed. Import a cookies.txt exported from ${label} instead.`;
  if (status === "timeout")
    return `${label} took too long to respond. Quit it fully, then try again.`;
  if (status === "extractor_error")
    return "YouTube could not be checked right now. Update the app or try again later.";
  return undefined;
}

// Keeps the last few lines of yt-dlp's own output so the UI can show the real
// reason a check failed instead of only a friendly summary.
function tailReason(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /error|warning|unable|failed/i.test(line));
  if (lines.length === 0) return undefined;
  return lines.slice(-3).join("\n").slice(0, 600);
}

interface AuthProbeResult {
  status: YouTubeAuthProbeStatus;
  reason?: string;
}

function probeOnce(
  url: string,
  cookieOptions: Record<string, unknown>,
  onChild: (child: ChildProcess | null) => void,
): Promise<AuthProbeResult> {
  return new Promise((resolve) => {
    const child = yt!.exec(
      url,
      { ...cookieOptions, simulate: true, verbose: true },
      { env: childEnv() },
    );
    onChild(child);
    const chunks: Buffer[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (status: YouTubeAuthProbeStatus, output: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      onChild(null);
      console.log(
        `[server] youtube auth probe ${status}` +
          (status === "signed_in"
            ? ""
            : `: ${tailReason(output) ?? "no detail"}`),
      );
      resolve({
        status,
        reason: status === "signed_in" ? undefined : tailReason(output),
      });
    };
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) =>
      finish(classifyYouTubeAuthOutput(String(error)), String(error)),
    );
    child.on("close", () => {
      const output = Buffer.concat(chunks).toString();
      finish(classifyYouTubeAuthOutput(output), output);
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("timeout", Buffer.concat(chunks).toString());
    }, AUTH_PROBE_TIMEOUT_MS);
  });
}

/** Tries each probe video until one gives a verdict about the session. */
export async function probeYouTubeAuth(
  cookieOptions: Record<string, unknown>,
  onChild: (child: ChildProcess | null) => void,
  shouldStop: () => boolean = () => false,
): Promise<AuthProbeResult> {
  let last: AuthProbeResult = {
    status: "probe_unavailable",
    reason: "No probe video could be reached.",
  };
  for (const url of AUTH_PROBE_URLS) {
    // Nobody is waiting any more: do not start the next probe child.
    if (shouldStop()) return last;
    last = await probeOnce(url, cookieOptions, onChild);
    // A dead probe target says nothing about the session, and neither does a
    // run whose output carried no recognisable marker — try the next video
    // before letting either stand as the verdict.
    if (last.status !== "probe_unavailable" && last.status !== "inconclusive") {
      return last;
    }
    console.log(
      `[server] auth probe ${last.status} on this target, trying the next one`,
    );
  }
  return last;
}
