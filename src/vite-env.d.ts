declare module "*.css";

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
  checkForUpdates: () => Promise<{ ok: boolean; version?: string; error?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  __API_BASE__?: string;
}
