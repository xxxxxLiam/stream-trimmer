/**
 * File: useStartController.ts
 * Path: src/renderer/src/features/start/hooks/useStartController.ts
 * Description: The one hook ColdStartScreen calls. Puts a link in (typed, the Paste
 *   button, or the copied-link offer), opens the video through the clipper context, and opens the
 *   save folder from the folder chip.
 */
import { useCallback } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace } from "../../workspace/hooks/WorkspaceContext";
import { pasteKeyLabel, plainOpenError, shortLink, youtubeLinkFromText, type ToolsStatus } from "../utils/startUtils";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { useStartEffects } from "./useStartEffects";
import { useToolsStatusQueries } from "./useToolsStatusQueries";
import type { ColdStartProps } from "../components/ColdStart";

export function useStartController(toolsOverride?: ToolsStatus): ColdStartProps {
  const { url, setUrl, flushAutoLoad, error, saveDir, loadingInfo, searchNow, info } = useClipperContext();
  const ws = useWorkspace();
  const { folders } = useCampaign();
  const tools = useToolsStatusQueries(toolsOverride);
  const dir = folders.clipsDir || saveDir || "";

  // A pasted link opens at once (no debounce), whatever the tools say: if they are not ready the open
  // fails with a sentence and Try again, which is better than a link stuck in the box. Typed text keeps the debounce.
  const openLink = useCallback(
    (text: string) => {
      if (youtubeLinkFromText(text)) flushAutoLoad();
      setUrl(text.trim());
    },
    [flushAutoLoad, setUrl],
  );

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

  // Another video that is already open: the way back when this link will not open.
  const other = [...ws.tabs].reverse().find((t) => t.id !== ws.activeId && !!t.url && !t.done);

  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return {
    pasteKey: pasteKeyLabel(platform),
    value: url,
    onChange: (v) => (youtubeLinkFromText(v) ? openLink(v) : setUrl(v)),
    onPasteButton,
    offer: copied && !url ? { text: copied, short: shortLink(copied) } : null,
    onUseOffer: () => copied && openLink(copied),
    toolsStatus: tools.status,
    onRetryTools: tools.retry,
    opening: !!url && loadingInfo && !info,
    problem: url && !loadingInfo ? (error ? plainOpenError(error) : "") : "",
    onRetryOpen: searchNow,
    backTo: other ? { label: ws.labelFor(other.id), onBack: () => ws.selectTab(other.id) } : null,
    folderLabel: folderChipLabel(dir),
    onOpenFolder,
  };
}
