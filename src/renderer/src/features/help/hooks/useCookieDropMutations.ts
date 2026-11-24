/**
 * File: useCookieDropMutations.ts
 * Path: src/renderer/src/features/help/hooks/useCookieDropMutations.ts
 * Description: Writes for the sign-in page: adopt a dropped or chosen cookies.txt through the main
 *   process and report the approved reason when it is refused. Dropping a new file replaces the
 *   sentence; success clears it (the footer's "at 360p" and pill go away by themselves).
 */
import { useCallback, useState } from "react";
import { cookieReason, type CookieReason, type CookieRefusal } from "../utils/cookieReasons";
import { restoreConnection } from "../../../shared/utils/youtubeConnection";

export function useCookieDropMutations() {
  const [problem, setProblem] = useState<CookieReason | null>(null);
  const [done, setDone] = useState(false);

  const settle = useCallback(async (res: CookieRefusal | undefined) => {
    if (res?.ok) {
      setProblem(null);
      setDone(true);
      await restoreConnection();
    } else {
      setDone(false);
      setProblem(cookieReason(res));
    }
  }, []);

  const onFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      await settle(await window.electronAPI?.importYouTubeCookiesText?.(await file.text()));
    },
    [settle],
  );

  const choose = useCallback(async () => {
    const res = await window.electronAPI?.importYouTubeCookies?.();
    if (res && !res.cancelled) await settle(res as CookieRefusal);
  }, [settle]);

  return { problem, done, onFile, choose };
}
