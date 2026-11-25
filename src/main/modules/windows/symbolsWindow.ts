/**
 * File: symbolsWindow.ts
 * Path: src/main/modules/windows/symbolsWindow.ts
 * Description: The Symbols and phrases window: one small frameless window that stays on top of every
 *   other app, on every desktop. One instance only; Esc closes it. The content is the renderer's.
 */
import path from "node:path";
import electron from "electron";
import { isDev } from "../../shared/utils/env";
import { closesSymbols, symbolsUrl, symbolsWindowOptions } from "./symbolsWindowOptions";

const { BrowserWindow } = electron;

let symbols: Electron.BrowserWindow | null = null;
let port = 0;

/** Remembered at launch so the window can load the same local UI as the main window. */
export function rememberUiPort(p: number) {
  port = p;
}

/** Opens the window, or brings the one that exists to the front. */
export async function openSymbolsWindow() {
  if (symbols && !symbols.isDestroyed()) {
    symbols.show();
    symbols.focus();
    return { ok: true };
  }
  const win = new BrowserWindow({
    ...symbolsWindowOptions(),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--api-base=http://127.0.0.1:${port}`],
    },
  });
  symbols = win;
  // Above full-screen apps too, and on every Space / virtual desktop.
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on("before-input-event", (event: Electron.Event, input: Electron.Input) => {
    if (closesSymbols(input)) {
      event.preventDefault();
      win.close();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // This window shows one page and never goes anywhere else.
  const stay = (event: Electron.Event) => event.preventDefault();
  win.webContents.on("will-navigate", stay);
  win.webContents.on("will-redirect", stay);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on("closed", () => {
    if (symbols === win) symbols = null;
  });
  await win.loadURL(symbolsUrl(isDev ? "http://localhost:8080" : `http://127.0.0.1:${port}`));
  return { ok: true };
}
