/**
 * File: windows.ts
 * Path: src/main/modules/windows/windows.ts
 * Description: The splash window and the main window, and the one place that
 *   remembers which they are. Nothing else holds a reference to either.
 */
import path from "node:path";
import electron from "electron";
import { isDev } from "../../shared/utils/env";

const { BrowserWindow, shell } = electron;

let mainWindow: any = null;
let splashWindow: any = null;

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
    backgroundColor: "#0B0B0C",
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
    backgroundColor: "#0B0B0C",
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
    mainWindow.webContents.on("before-input-event", (event: any, input: any) => {
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

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }: any) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:8080");
  } else {
    try {
      await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    } catch (err: any) {
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
