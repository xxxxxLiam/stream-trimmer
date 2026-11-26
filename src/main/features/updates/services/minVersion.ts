/**
 * File: minVersion.ts
 * Path: src/main/features/updates/services/minVersion.ts
 * Description: The minimum-version gate. At launch Clipr asks the relay for the oldest version allowed to run. If this
 *   copy is older it is blocked behind a "Please update" screen. It fails OPEN: no answer, a slow answer, an error or
 *   anything that is not a plain version means the app runs as normal. The relay holds one value (MIN_VERSION); nothing
 *   is pushed to anyone's computer.
 */
import type { VersionGateStatus } from "../../../../common/types/updates";
import { RELAY_CLIENT_HEADER, RELAY_CLIENT_VALUE, RELAY_URL } from "../../reports/services/relayConfig";

export const MIN_VERSION_TIMEOUT_MS = 4000;

export type MinVersionStatus = VersionGateStatus;

/** "19.5.1" or "v19.5.1" into [19, 5, 1]; null for anything else. */
export function parseVersion(raw: unknown): [number, number, number] | null {
  if (typeof raw !== "string") return null;
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(raw.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isBelow(current: string, required: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(required);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export interface MinVersionDeps {
  fetchFn?: typeof fetch;
  relayUrl?: string;
  appVersion: string;
  timeoutMs?: number;
}

export async function checkMinVersion(deps: MinVersionDeps): Promise<MinVersionStatus> {
  const open: MinVersionStatus = { blocked: false, required: null, current: deps.appVersion };
  const base = (deps.relayUrl ?? RELAY_URL).replace(/\/+$/, "");
  if (!base) return open;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? MIN_VERSION_TIMEOUT_MS);
  try {
    const res = await (deps.fetchFn ?? fetch)(`${base}/min-version`, {
      method: "GET",
      headers: { [RELAY_CLIENT_HEADER]: RELAY_CLIENT_VALUE },
      signal: controller.signal,
    });
    if (!res.ok) return open;
    const body = (await res.json()) as { minVersion?: unknown };
    const required = parseVersion(body?.minVersion) ? String(body.minVersion).trim().replace(/^v/, "") : null;
    if (!required) return open;
    return { blocked: isBelow(deps.appVersion, required), required, current: deps.appVersion };
  } catch {
    return open;
  } finally {
    clearTimeout(timer);
  }
}

let cached: Promise<MinVersionStatus> | null = null;

/** One check per launch; every caller gets the same answer. */
export function versionGateStatus(appVersion: string): Promise<MinVersionStatus> {
  cached ??= checkMinVersion({ appVersion });
  return cached;
}
