/**
 * File: symbolsWindowOptions.ts
 * Path: src/main/modules/windows/symbolsWindowOptions.ts
 * Description: What the Symbols and phrases window looks like and how it closes. Pure (no electron
 *   import) so it can be tested.
 */

export const SYMBOLS_WIDTH = 396;
export const SYMBOLS_HEIGHT = 520;
/** The renderer shows the symbols content when it is loaded with this query. */
export const SYMBOLS_QUERY = "window=symbols";

/** Frameless, small, and always above other apps (TikTok, the editor) while a caption is written. */
export function symbolsWindowOptions() {
  return {
    width: SYMBOLS_WIDTH,
    height: SYMBOLS_HEIGHT,
    minWidth: SYMBOLS_WIDTH,
    maxWidth: SYMBOLS_WIDTH,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#0A0D0F",
  };
}

/** Esc closes the window; nothing else does. */
export function closesSymbols(input: { type: string; key: string }): boolean {
  return input.type === "keyDown" && input.key === "Escape";
}

export function symbolsUrl(base: string): string {
  return `${base.replace(/\/$/, "")}/?${SYMBOLS_QUERY}`;
}
