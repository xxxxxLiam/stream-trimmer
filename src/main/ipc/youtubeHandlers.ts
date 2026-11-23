/**
 * File: youtubeHandlers.ts
 * Path: src/main/ipc/youtubeHandlers.ts
 * Description: The imported YouTube session: probe it, import a cookies.txt (from
 *   a picked file or dropped text), disconnect it, and the fallback sign-in page.
 */
import electron from "electron";
import * as logger from "../../../electron/logger";
import { getMainWindow } from "../modules/windows/windows";
import {
  disconnect,
  importCookiesFromFile,
  importCookiesFromText,
  openSignInPage,
  probeSession,
} from "../features/youtube/services/youtubeService";

const { dialog, ipcMain, shell } = electron;

export function registerYoutubeHandlers() {
  ipcMain.handle("youtube:probe", () => probeSession());

  // Import a cookies.txt the user exported from their own browser. On Windows
  // this is the only route that reliably works — see cookieFile.ts.
  ipcMain.handle("youtube:importCookies", async () => {
    try {
      const res = await dialog.showOpenDialog(getMainWindow(), {
        title: "Choose the cookies.txt you exported",
        properties: ["openFile"],
        filters: [
          { name: "Cookies", extensions: ["txt"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }
      return await importCookiesFromFile(res.filePaths[0]);
    } catch (err: any) {
      logger.log("youtube", `cookie import threw: ${logger.describe(err)}`);
      return { ok: false, error: logger.describe(err) };
    }
  });

  ipcMain.handle("youtube:importCookiesText", async (_e: any, text: any) => {
    if (typeof text !== "string" || text.length > 5_000_000) {
      return { ok: false, error: "That does not look like a cookies.txt file." };
    }
    return importCookiesFromText(text);
  });

  ipcMain.handle("youtube:disconnect", () => disconnect());

  ipcMain.handle("shell:openYouTubeSignIn", () => openSignInPage(shell));
}
