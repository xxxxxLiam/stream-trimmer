/**
 * File: useCookieDropMutations.ts
 * Path: src/renderer/src/features/settings/hooks/useCookieDropMutations.ts
 * Description: Writes for the sign-in page: adopt a dropped or chosen cookies.txt through the main
 *   process. The status card goes to Checking before the main process is asked (it answers only after
 *   YouTube has been tried), then to the answer. A new drop restarts Checking.
 */
import { useCallback } from "react";
import { restoreConnection, signOut } from "../../../shared/utils/youtubeConnection";
import { setSignInStatus, statusFromAnswer, useSignInStatus, type CookieAnswer } from "../utils/signInStatus";

export function useCookieDropMutations() {
  const status = useSignInStatus();

  const settle = useCallback(async (res: CookieAnswer | undefined) => {
    const next = statusFromAnswer(res);
    setSignInStatus(next);
    // Saved but not checked: the footer keeps "at 360p" until a check succeeds (board 04.6.4).
    if (res?.ok && res.verify !== "unverified") await restoreConnection();
  }, []);

  const onFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setSignInStatus({ state: "checking" });
      await settle(await window.electronAPI?.importYouTubeCookiesText?.(await file.text()));
    },
    [settle],
  );

  const choose = useCallback(async () => {
    const before = status;
    setSignInStatus({ state: "checking" });
    const res = await window.electronAPI?.importYouTubeCookies?.();
    if (res?.cancelled) setSignInStatus(before?.state === "checking" ? null : before);
    else await settle(res as CookieAnswer | undefined);
  }, [settle, status]);

  const leave = useCallback(async () => {
    await signOut();
    setSignInStatus(null);
  }, []);

  return { status, onFile, choose, signOut: leave };
}
