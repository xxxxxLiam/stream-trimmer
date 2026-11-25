/**
 * File: crashFallback.ts
 * Path: src/main/modules/windows/crashFallback.ts
 * Description: The page the window shows when the app's own page process dies a second time within a minute (E2-2).
 *   It is plain HTML with no script, so nothing in it can die again; its three links carry a `clipr-action:` address
 *   that main answers (Reopen Clipr, Send report, Copy details). Pure, so it tests without Electron.
 */

export const ACTION_SCHEME = "clipr-action:";
export type FallbackAction = "reopen" | "send" | "copy";
export interface FallbackState {
  /** After Send report: whether the relay took it or it is kept for later. */
  sent?: "sent" | "kept";
  copied?: boolean;
}

const ACTIONS: readonly FallbackAction[] = ["reopen", "send", "copy"];

/** The action a clicked address names, or null for any other address. */
export function fallbackAction(url: string): FallbackAction | null {
  if (typeof url !== "string" || !url.startsWith(ACTION_SCHEME)) return null;
  const name = url.slice(ACTION_SCHEME.length).replace(/^\/+/, "").replace(/[/?#].*$/, "");
  return (ACTIONS as readonly string[]).includes(name) ? (name as FallbackAction) : null;
}

/** True for the page this module builds, so an action address is only obeyed from it. */
export const isFallbackUrl = (url: string): boolean => typeof url === "string" && url.startsWith("data:text/html");

// The design tokens, as the static page cannot use the app's stylesheet.
const CSS = `
html,body{margin:0;height:100%;background:#0A0D0F;color:#F2F5F6;font:15px/1.4 Inter,system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
main{width:480px;max-width:100%;box-sizing:border-box;background:#121619;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:17px;font-weight:500}
p{margin:0}.dim{color:#94A0A5}.meta{font-size:13px}
nav{display:flex;flex-wrap:wrap;gap:8px}
a{display:inline-flex;align-items:center;height:44px;box-sizing:border-box;padding:0 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.14);background:#181D21;color:#F2F5F6;text-decoration:none}
a:hover{background:#232A2F}
a.primary{background:#5FD8CA;border-color:#5FD8CA;color:#0A0D0F;font-weight:500}
`;

export function crashFallbackHtml(state: FallbackState = {}): string {
  const status = state.sent
    ? `<p role="status">${state.sent === "sent" ? "Sent. Thank you." : "Saved. Clipr will send it when it can."}</p>`
    : `<p class="dim meta">Send a crash report? It includes the error, your app and system version, and recent activity with your name and file paths removed. Nothing is sent unless you press Send report.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipr hit a problem</title><style>${CSS}</style></head><body><main role="alert" id="ui-crash-fallback"><h1>Clipr hit a problem</h1><p class="dim">Your campaigns, clips and settings are saved. Reopen Clipr to carry on where you were.</p>${status}<nav><a class="primary" id="ui-crash-reopen" href="${ACTION_SCHEME}reopen">Reopen Clipr</a>${state.sent ? "" : `<a id="ui-crash-send" href="${ACTION_SCHEME}send">Send report</a>`}<a id="ui-crash-copy" href="${ACTION_SCHEME}copy">${state.copied ? "Copied" : "Copy details"}</a></nav></main></body></html>`;
}

export function crashFallbackUrl(state: FallbackState = {}): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(crashFallbackHtml(state))}`;
}
