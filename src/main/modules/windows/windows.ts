/**
 * File: windows.ts
 * Path: src/main/modules/windows/windows.ts
 * Description: The splash window and the main window, and the one place that
 *   remembers which they are. Nothing else holds a reference to either.
 */
import path from "node:path";
import electron from "electron";
import { isDev } from "../../shared/utils/env";
import { rememberUiPort } from "./symbolsWindow";
import { isAppUrl, isSafeExternalUrl } from "./navigationGuard";
import { createCrashRecovery, crashedUrl } from "./crashRecovery";

const { BrowserWindow, shell } = electron;

let mainWindow: Electron.BrowserWindow | null = null;
let splashWindow: Electron.BrowserWindow | null = null;

/** The main window, or null before createWindow() has run. */
export function getMainWindow(): any {
  return mainWindow;
}

export function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    transparent: false,
    backgroundColor: "#0A0D0F",
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, "..", "..", "resources", "splash.html"));
  splashWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

export function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

export async function createWindow(port: number) {
  rememberUiPort(port);
  mainWindow = new BrowserWindow({
    // The window may not be smaller than the clipping loop needs. At the old
    // 900x600 floor the mark bar and the Cut button could never be on screen
    // together, so every single clip cost a scroll; the old 1100 default was
    // also narrower than the three-column breakpoint, so a first launch got
    // the stacked fallback. Both are the same mistake — advertising a size
    // the app does not actually work at.
    width: 1280,
    height: 820,
    minWidth: 1160,
    minHeight: 760,
    backgroundColor: "#0A0D0F",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--api-base=http://127.0.0.1:${port}`],
    },
  });

  mainWindow.once("ready-to-show", () => {
    closeSplash();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  // Cmd+W must close the TAB, not the window.
  //
  // No application menu is set, so Electron keeps its default one, and on macOS a menu
  // accelerator wins before the page ever sees the key: Cmd+W would close the whole
  // window with every tab in it, which is not what any browser does and not what the
  // shortcut in the tab strip promises. preventDefault here stops the menu accelerator
  // firing while still delivering the key to the renderer, which closes the tab.
  //
  // Only this one chord, and only on macOS, where the conflict exists; Windows and Linux
  // already let the page handle it first. Cmd+Shift+W is left alone as the way to close
  // the window, matching browsers.
  if (process.platform === "darwin") {
    mainWindow.webContents.on("before-input-event", (event: Electron.Event, input: Electron.Input) => {
      if (
        input.type === "keyDown" &&
        input.meta &&
        !input.shift &&
        !input.control &&
        !input.alt &&
        input.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
      }
    });
  }

  const appUrl = isDev ? "http://localhost:8080/" : `http://127.0.0.1:${port}/`;
  const appOrigins = [new URL(appUrl).origin];

  // Open external links in the user's browser, not inside the app, and only ones that are safe to hand over.
  const toBrowser = (url: string) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }: Electron.HandlerDetails) => {
    toBrowser(url);
    return { action: "deny" };
  });
  // The window only ever shows the app. A link, a dropped file or a redirect that would take it
  // elsewhere is stopped (a page that kept the preload bridge could otherwise reach the person's files).
  const stayInApp = (event: Electron.Event, url: string) => {
    if (isAppUrl(url, appOrigins)) return;
    event.preventDefault();
    toBrowser(url);
  };
  mainWindow.webContents.on("will-navigate", stayInApp);
  mainWindow.webContents.on("will-redirect", stayInApp);

  // If the page process dies, reload it once with the crashed flag so the app can say so (and offer Send report).
  const recovery = createCrashRecovery();
  mainWindow.webContents.on("render-process-gone", (_e: unknown, details: Electron.RenderProcessGoneDetails) => {
    if (recovery.onGone(details?.reason ?? "crashed") !== "reload") return;
    if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(crashedUrl(appUrl)).catch(() => undefined);
  });

  if (isDev) {
    await mainWindow.loadURL(appUrl);
  } else {
    try {
      await mainWindow.loadURL(appUrl);
    } catch (err: unknown) {
      // Emergency fallback — the app still works, minus the video preview.
      console.error("[electron] http load failed, falling back to file://", err);
      await mainWindow.loadFile(
        path.join(__dirname, "..", "..", "dist", "index.html"),
      );
    }
  }

  // Safety net: never leave the app invisible if ready-to-show never fires.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      closeSplash();
      mainWindow.show();
    }
  }, 8000);
}
