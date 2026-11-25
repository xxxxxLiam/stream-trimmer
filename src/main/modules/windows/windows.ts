/**
 * File: windows.ts
 * Path: src/main/modules/windows/windows.ts
 * Description: The splash window and the main window, and the one place that
 *   remembers which they are. Nothing else holds a reference to either.
 */
import { isZoomInChord, maxZoomFactor, zoomInBlocked } from "./zoomLimit";
import { appMenuTemplate } from "./appMenu";
import { titleBarOptions } from "./windowChrome";
import { IPC } from "../../../common/ipc/channels";
import path from "node:path";
import electron from "electron";
import { isDev } from "../../shared/utils/env";
import { rememberUiPort } from "./symbolsWindow";
import { isAppUrl, isSafeExternalUrl } from "./navigationGuard";
import os from "node:os";
import { createCrashRecovery, pageAfterDeath } from "./crashRecovery";
import { crashFallbackUrl, fallbackAction, isFallbackUrl } from "./crashFallback";
import { createFallbackController } from "./crashFallbackActions";
import { readLogScrubbed } from "../../features/diagnostics/services/diagnosticsService";
import { sendReport } from "../../features/reports/services/reportService";

const { BrowserWindow, Menu, shell, clipboard, app: electronApp } = electron;

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
    // macOS: the app's own top bar is the title bar (Windows and Linux keep the native frame).
    ...titleBarOptions(process.platform),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--api-base=http://127.0.0.1:${port}`],
    },
  });

  // The top bar drops its room for the traffic lights in full screen (the dots go away there).
  const tellFullScreen = (on: boolean) => () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.windowFullScreen, on);
  };
  mainWindow.on("enter-full-screen", tellFullScreen(true));
  mainWindow.on("leave-full-screen", tellFullScreen(false));

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

  // Zoom (Ctrl/Cmd +) shrinks the page's css width; past a point the preview has no room left. Stop
  // zoom-in at that point, and pull the zoom back if a resize or a saved zoom already went past it.
  const clampZoom = () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    const max = maxZoomFactor(win.getContentSize()[0]);
    if (wc.getZoomFactor() > max + 1e-6) wc.setZoomFactor(max);
  };
  mainWindow.webContents.on("before-input-event", (event: Electron.Event, input: Electron.Input) => {
    if (!mainWindow || mainWindow.isDestroyed() || !isZoomInChord(input)) return;
    if (zoomInBlocked(mainWindow.webContents.getZoomLevel(), mainWindow.getContentSize()[0])) event.preventDefault();
  });
  mainWindow.webContents.on("zoom-changed", (_e: Electron.Event) => setTimeout(clampZoom, 0));
  mainWindow.on("resize", clampZoom);
  mainWindow.webContents.on("did-finish-load", clampZoom);

  // The View menu's Zoom In must obey the same cap as the key chord, so the menu is ours (see appMenu.ts).
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      appMenuTemplate(process.platform, () => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        if (!win || win.isDestroyed()) return null;
        return {
          getZoomLevel: () => win.webContents.getZoomLevel(),
          setZoomLevel: (l: number) => win.webContents.setZoomLevel(l),
          contentWidth: () => win.getContentSize()[0],
        };
      }) as Electron.MenuItemConstructorOptions[],
    ),
  );

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
    // The static crash page's own links, and only from that page (E2-2).
    const action = fallbackAction(url);
    if (action) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed() && isFallbackUrl(mainWindow.webContents.getURL())) void fallback.run(action);
      return;
    }
    event.preventDefault();
    toBrowser(url);
  };
  const loadInWindow = (url: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(url).catch(() => undefined);
  };
  const crashError = "The window's page process stopped twice within a minute.";
  const fallback = createFallbackController({
    appUrl,
    load: loadInWindow,
    send: async () => ((await sendReport({ kind: "crash", error: crashError })).status === "sent" ? "sent" : "kept"),
    copy: () =>
      clipboard.writeText(
        `Clipr ${electronApp.getVersion()} on ${process.platform} ${os.release()}\n${crashError}\n\n${readLogScrubbed(60)}`,
      ),
  });
  mainWindow.webContents.on("will-navigate", stayInApp);
  mainWindow.webContents.on("will-redirect", stayInApp);

  // If the page process dies, reload it once with the crashed flag so the app can say so (and offer Send report).
  const recovery = createCrashRecovery();
  mainWindow.webContents.on("render-process-gone", (_e: unknown, details: Electron.RenderProcessGoneDetails) => {
    // A second death inside a minute gets the static page, which has no script to die again.
    const next = pageAfterDeath(recovery, details?.reason ?? "crashed", appUrl, () => {
      fallback.reset();
      return crashFallbackUrl();
    });
    if (next) loadInWindow(next);
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
