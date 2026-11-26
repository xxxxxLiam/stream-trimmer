/**
 * File: useStartController.ts
 * Path: src/renderer/src/features/start/hooks/useStartController.ts
 * Description: The one hook ColdStartScreen calls. Puts a link in (typed, the Paste
 *   button, or the copied-link offer), opens the video through the clipper context, and opens the
 *   save folder from the folder chip.
 */
import { useCallback, useRef, useState } from "react";
import { resolveLink } from "../../workspace/utils/videoList";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace } from "../../workspace/hooks/WorkspaceContext";
import { extractVideoId } from "../../../shared/utils/clip";
import { NOT_A_VIDEO, pasteKeyLabel, plainOpenError, shortLink, youtubeLinkFromText, type ToolsStatus } from "../utils/startUtils";
import { FOLDER_NOT_MADE_YET, folderChipLabel } from "../../../shared/utils/folderLabel";
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
  // Text that was pasted or submitted and is not a video link gets a sentence (A-9); typing alone does not.
  const [submitted, setSubmitted] = useState("");
  const pasting = useRef(false);
  const openLink = useCallback(
    (text: string) => {
      if (youtubeLinkFromText(text)) flushAutoLoad();
      else setSubmitted(text.trim());
      setUrl(text.trim());
    },
    [flushAutoLoad, setUrl],
  );

  // Home (the icon in the top bar): the start page over a workspace. Its box is its own, never the open video's link,
  // and a link here opens that video (or switches to it when it is already in Videos) and never replaces or duplicates one.
  const home = ws.home;
  const [homeText, setHomeText] = useState("");
  const openHomeLink = useCallback(
    (text: string) => {
      const action = resolveLink(text, ws.tabs);
      if (action.kind !== "open") {
        setSubmitted(text.trim());
        setHomeText(text.trim());
        return;
      }
      if (action.existingId) {
        if (action.reopen) ws.setTabDone(action.existingId, false);
        ws.selectTab(action.existingId);
      } else ws.addTab(action.target);
      setHomeText("");
      ws.closeHome();
    },
    [ws],
  );

  const { copied } = useStartEffects({ active: !url || home });

  const onPasteButton = useCallback(() => {
    navigator.clipboard
      ?.readText()
      .then((t) => t && (home ? openHomeLink(t) : openLink(t)))
      .catch(() => {});
  }, [openLink, openHomeLink, home]);

  const [folderNote, setFolderNote] = useState("");
  const onOpenFolder = useCallback(() => {
    if (dir) void window.electronAPI?.showInFolder(dir).then((r) => setFolderNote(r?.missing ? FOLDER_NOT_MADE_YET : ""));
  }, [dir]);

  // The video you were on: the way back when this link will not open. Never "the last one in the list".
  const backId = ws.backTargetFor(ws.activeId);

  const homeView: Partial<ColdStartProps> = home
    ? {
        value: homeText,
        onChange: (v) => {
          if (youtubeLinkFromText(v)) return openHomeLink(v);
          if (pasting.current && !extractVideoId(v)) setSubmitted(v.trim());
          pasting.current = false;
          setHomeText(v);
        },
        onSubmit: () => {
          if (homeText.trim()) openHomeLink(homeText);
        },
        offer: copied ? { text: copied, short: shortLink(copied) } : null,
        onUseOffer: () => copied && openHomeLink(copied),
        opening: false,
        problem: homeText && submitted === homeText.trim() ? NOT_A_VIDEO : "",
        onRetryOpen: () => openHomeLink(homeText),
        backTo: null,
        returnTo: { label: ws.labelFor(ws.activeId), onReturn: ws.closeHome },
      }
    : {};

  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return {
    pasteKey: pasteKeyLabel(platform),
    value: url,
    onChange: (v) => {
      if (youtubeLinkFromText(v)) return openLink(v);
      if (pasting.current && !extractVideoId(v)) setSubmitted(v.trim());
      pasting.current = false;
      setUrl(v);
    },
    onPasteText: () => {
      pasting.current = true;
    },
    onSubmit: () => {
      if (!url.trim()) return;
      if (extractVideoId(url)) searchNow();
      else setSubmitted(url.trim());
    },
    onPasteButton,
    offer: copied && !url ? { text: copied, short: shortLink(copied) } : null,
    onUseOffer: () => copied && openLink(copied),
    toolsStatus: tools.status,
    onRetryTools: tools.retry,
    opening: !!url && loadingInfo && !info,
    // A stale engine error never shows for text that is not a video; the not-a-video sentence shows only for pasted or submitted text.
    problem: !url || loadingInfo ? "" : extractVideoId(url) ? (error ? plainOpenError(error) : "") : submitted === url.trim() ? NOT_A_VIDEO : "",
    onRetryOpen: searchNow,
    backTo: backId ? { label: ws.labelFor(backId), onBack: () => ws.goBack(ws.activeId) } : null,
    folderLabel: folderChipLabel(dir),
    onOpenFolder,
    folderNote,
    ...homeView,
  };
}
