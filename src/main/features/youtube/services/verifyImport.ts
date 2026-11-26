/**
 * File: verifyImport.ts
 * Path: src/main/features/youtube/services/verifyImport.ts
 * Description: After a cookies.txt is adopted, asks the local engine to try the
 *   session against YouTube, and turns the answer into one plain verdict.
 *   The file stays on disk whatever the verdict: a failed check is not a bad file.
 */
import type { ImportVerified } from "../../../../common/types/signIn";

export const VERIFY_TIMEOUT_MS = 45_000;

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function verifyImportedSession(
  port: string | number | undefined,
  deps: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<ImportVerified> {
  const doFetch: Fetch = deps.fetch ?? ((u, i) => fetch(u, i) as any);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), deps.timeoutMs ?? VERIFY_TIMEOUT_MS);
  try {
    if (!port) throw new Error("no engine port");
    const res = await doFetch(`http://127.0.0.1:${port}/api/auth/youtube/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser: "app" }),
      signal: ac.signal,
    });
    const body: any = await res.json();
    if (body?.status === "signed_in") {
      return { verify: "signed_in", message: "You're signed in to YouTube." };
    }
    if (body?.status === "signed_out") {
      return {
        verify: "rejected",
        message: "YouTube didn't accept this sign-in. Export a fresh cookies file while signed in and add it again.",
      };
    }
    return {
      verify: "unverified",
      message: "The file was saved, but Clipr couldn't check it with YouTube just now. It will be tried on your next download.",
    };
  } catch {
    return {
      verify: "unverified",
      message: "The file was saved, but Clipr couldn't check it with YouTube just now. It will be tried on your next download.",
    };
  } finally {
    clearTimeout(timer);
  }
}
