/**
 * File: signInService.ts
 * Path: src/main/features/youtube/services/signInService.ts
 * Description: Feeds the sign-in signal to the footer: seeds it from the cookies.txt at launch, pushes
 *   changes to the window, and takes the browser sweep's result.
 */
import { IPC } from "../../../../common/ipc/channels";
import { signIn } from "../../../shared/utils/signInSignal";
import { getMainWindow } from "../../../modules/windows/windows";
import * as youtubeSession from "./youtubeSession";

export function getSignInSignal() {
  return signIn.get();
}

export function reportBrowserSignIn(usable: unknown) {
  if (typeof usable !== "boolean") return { ok: false };
  signIn.setBrowserUsable(usable);
  return { ok: true };
}

/** Call once after the window exists. */
export async function startSignInSignal() {
  signIn.subscribe((signal) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.signInSignal, signal);
  });
  try {
    const state: any = await youtubeSession.probe();
    signIn.setFileUsable(Boolean(state.connected) && !state.expired);
  } catch {
    /* unreadable file: the sweep and the engine will say */
  }
}
