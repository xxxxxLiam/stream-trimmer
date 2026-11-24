/// <reference types="vite/client" />
declare module "*.css";

interface ImportMetaEnv {
  /** Off by default. Set to 1 to include the channel-data tool in a build. */
  readonly VITE_ENABLE_CHANNEL_DATA?: string;
  /** Comma-separated salted machine hashes (npm run machine-id). "*" = any. */
  readonly VITE_OWNER_MACHINES?: string;
  /** Salt for those hashes. Must be the same in every build. */
  readonly VITE_OWNER_SALT?: string;
}

/** Baked by vite.config.ts. Prefer these over reading import.meta.env. */
declare const __CHANNEL_DATA__: boolean;
declare const __OWNER_MACHINES__: string;
declare const __OWNER_SALT__: string;x

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


interface Window {
  electronAPI?: import("../../common/ipc/electronApi").ElectronAPI;
  __API_BASE__?: string;
}
