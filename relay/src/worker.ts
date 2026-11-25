/**
 * File: worker.ts
 * Path: relay/src/worker.ts
 * Description: The Cloudflare Worker entry. `npm run build:relay` bundles it into relay/dist/worker.js, one file to paste
 *   into the Cloudflare dashboard.
 */
import { createRelay, type Env } from "./handler";

const relay = createRelay({ fetch: (...args) => fetch(...args), now: () => Date.now() });

export default {
  fetch: (request: Request, env: Env) => relay(request, env),
};
