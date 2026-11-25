/**
 * File: useAddVideoController.ts
 * Path: src/renderer/src/features/workspace/hooks/useAddVideoController.ts
 * Description: The only hook TopBarLinkField calls. Holds the field's editing state and what Enter does (open or add the pasted video, or show why it can't). Esc puts the
 *   title back.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace } from "./WorkspaceContext";
import type { ChannelLink } from "../components/TopBarLinkField";
import { linkKind, linkInText, resolveLink } from "../utils/videoList";

export function useAddVideoController(channel?: ChannelLink) {
  const ws = useWorkspace();
  const { info } = useClipperContext();
  const { active } = useCampaign();
  const title = info?.title ?? "";
  const [editing, setEditing] = useState(false);
  const [text, setTextState] = useState("");
  const [problem, setProblem] = useState("");
  const ref = useRef<RefObject<HTMLInputElement | null> | null>(null);

  // A link that would not open puts the panel back with the reason, in the same place, ready to try again.
  useEffect(() => {
    if (!ws.openFailure) return;
    setTextState((t) => t || title);
    setEditing(true);
    requestAnimationFrame(() => input()?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.openFailure]);

  const input = () => ref.current?.current ?? null;
  const leave = () => {
    setEditing(false);
    setProblem("");
    input()?.blur();
  };

  const action = resolveLink(text, ws.tabs);
  const isTitle = text === title;
  const canAdd = !isTitle && action.kind === "open";

  const submit = () => {
    if (ws.opening) return; // one link at a time: the panel already says it is opening
    if (isTitle || action.kind === "empty") return leave();
    // Owner build: a channel link goes to Channel data instead of being refused as "not a video".
    if (channel?.isChannelUrl(text.trim())) {
      channel.onLink(text.trim());
      return leave();
    }
    if (action.kind === "error") return setProblem(action.message);
    if (action.existingId) {
      if (action.reopen) ws.setTabDone(action.existingId, false);
      ws.selectTab(action.existingId);
      leave();
      return;
    }
    // A new link opens in the background: the panel stays and says so until it has opened (or says why not).
    ws.addTab(action.target);
  };

  return {
    title,
    editing,
    text,
    problem: problem || ws.openFailure,
    opening: ws.opening,
    canAdd,
    addsNew: canAdd && action.kind === "open" && !action.existingId,
    campaign: active?.name ?? "",
    bindInput: (r: RefObject<HTMLInputElement | null>) => {
      ref.current = r;
    },
    setText: (v: string) => {
      setTextState(v);
      setProblem("");
      ws.clearOpenFailure();
    },
    onFocus: () => {
      setTextState(title);
      setProblem("");
      setEditing(true);
      // Select the title so a paste replaces it.
      requestAnimationFrame(() => input()?.select());
    },
    onBlur: () => {
      setEditing(false);
      setProblem("");
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        leave();
      }
    },
  };
}

// Re-exported so the field's tests and the Videos list agree on what counts as a link.
export { linkKind, linkInText };
