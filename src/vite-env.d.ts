/// <reference types="vite/client" />
declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_CHANNEL_PASSCODE_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type UpdateStatusPayload =
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "none" }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version?: string }
  | { state: "error"; message: string };

interface ElectronAPI {
  isElectron: true;
  pickDirectory: () => Promise<string | null>;
  saveFile: (payload: {
    dirPath: string;
    filename: string;
    data: ArrayBuffer | Uint8Array;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveFiles: (payload: {
    dirPath: string;
    folder: string;
    files: { name: string; contents: string }[];
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  showInFolder: (
    targetPath: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  openYouTubeSignIn: () => Promise<{ ok: boolean; error?: string }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }>;
  quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  __API_BASE__?: string;
}
