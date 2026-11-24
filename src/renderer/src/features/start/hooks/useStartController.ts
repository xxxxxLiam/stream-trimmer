/**
 * File: useStartController.ts
 * Path: src/renderer/src/features/start/hooks/useStartController.ts
 * Description: The one hook ColdStartScreen calls. Puts a link in (typed, the Paste
 *   button, or the copied-link offer), opens the video through the clipper context, and opens the
 *   save folder from the folder chip.
 */
import { useCallback, useEffect, useState } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { pasteKeyLabel, shortLink, youtubeLinkFromText, type ToolsStatus } from "../utils/startUtils";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { useStartEffects } from "./useStartEffects";
import { useToolsStatusQueries } from "./useToolsStatusQueries";
import type { ColdStartProps } from "../components/ColdStart";

export function useStartController(toolsOverride?: ToolsStatus): ColdStartProps {
  const { url, setUrl, flushAutoLoad, error, saveDir } = useClipperContext();
  const { folders } = useCampaign();
  const tools = useToolsStatusQueries(toolsOverride);
  const dir = folders.clipsDir || saveDir || "";

  // A link given while the tools are being checked waits in the box and opens when they are ready.
  const [held, setHeld] = useState("");
  const ready = tools.status === "ready";

  // A pasted link opens at once (no debounce); typed text keeps the debounce.
  const openLink = useCallback(
    (text: string) => {
      if (!ready) return setHeld(text.trim());
      if (youtubeLinkFromText(text)) flushAutoLoad();
      setUrl(text.trim());
    },
    [ready, flushAutoLoad, setUrl],
  );
  useEffect(() => {
    if (ready && held) {
      setHeld("");
      if (youtubeLinkFromText(held)) flushAutoLoad();
      setUrl(held);
    }
  }, [ready, held, flushAutoLoad, setUrl]);

  const { copied } = useStartEffects({ active: !url });

  const onPasteButton = useCallback(() => {
    navigator.clipboard
      ?.readText()
      .then((t) => t && openLink(t))
      .catch(() => {});
  }, [openLink]);

  const onOpenFolder = useCallback(() => {
    if (dir) void window.electronAPI?.showInFolder(dir);
  }, [dir]);

  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return {
    pasteKey: pasteKeyLabel(platform),
    value: held || url,
    onChange: (v) => (youtubeLinkFromText(v) ? openLink(v) : setUrl(v)),
    onPasteButton,
    offer: copied && !url && !held ? { text: copied, short: shortLink(copied) } : null,
    onUseOffer: () => copied && openLink(copied),
    toolsStatus: tools.status,
    onRetryTools: tools.retry,
    problem: url ? error : "",
    folderLabel: folderChipLabel(dir),
    onOpenFolder,
  };
}
