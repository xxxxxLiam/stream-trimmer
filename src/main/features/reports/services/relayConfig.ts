/**
 * File: relayConfig.ts
 * Path: src/main/features/reports/services/relayConfig.ts
 * Description: Where crash reports go. RELAY_URL is the address of the report relay (a Cloudflare Worker that
 *   files a private issue). It is empty until the relay is deployed: while it is, a report is kept and sent later.
 */

/** The relay's https address, no trailing slash, e.g. "https://clipr-relay.example.workers.dev". Empty until it is deployed. */
export const RELAY_URL = "";

/** The fixed header the relay filters noise with. It is not a secret. */
export const RELAY_CLIENT_HEADER = "X-Clipr-Client";
export const RELAY_CLIENT_VALUE = "clipr-app";

/** At most this many reports are kept, oldest dropped first. */
export const MAX_QUEUED = 20;
/** A kept report is tried on this many launches, then dropped. */
export const MAX_ATTEMPTS = 5;
