/**
 * File: useAddVideoController.ts
 * Path: src/renderer/src/features/workspace/hooks/useAddVideoController.ts
 * Description: The only hook TopBarLinkField calls. Holds the field's editing state and what Enter does (open or add the pasted video, or show why it can't). Esc puts the
 *   title back.
 */
import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace } from "./WorkspaceContext";
import { linkKind, linkInText, resolveLink } from "../utils/videoList";

export function useAddVideoController() {
  const ws = useWorkspace();
  const { info } = useClipperContext();
  const { active } = useCampaign();
  const title = info?.title ?? "";
  const [editing, setEditing] = useState(false);
  const [text, setTextState] = useState("");
  const [problem, setProblem] = useState("");
  const ref = useRef<RefObject<HTMLInputElement | null> | null>(null);

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
    if (isTitle || action.kind === "empty") return leave();
    if (action.kind === "error") return setProblem(action.message);
    if (action.existingId) {
      if (action.reopen) ws.setTabDone(action.existingId, false);
      ws.selectTab(action.existingId);
    } else ws.addTab(action.target);
    leave();
  };

  return {
    title,
    editing,
    text,
    problem,
    canAdd,
    addsNew: canAdd && action.kind === "open" && !action.existingId,
    campaign: active?.name ?? "",
    bindInput: (r: RefObject<HTMLInputElement | null>) => {
      ref.current = r;
    },
    setText: (v: string) => {
      setTextState(v);
      setProblem("");
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
