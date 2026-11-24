/**
 * File: env.ts
 * Path: src/main/shared/utils/env.ts
 * Description: Whether the app was started by `npm run dev:electron`. Read once,
 *   at load, exactly as main.ts used to.
 */
export const isDev = process.env.ELECTRON_DEV === "1";
