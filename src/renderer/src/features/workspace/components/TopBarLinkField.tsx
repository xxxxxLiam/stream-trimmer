/**
 * File: TopBarLinkField.tsx
 * Path: src/renderer/src/features/workspace/components/TopBarLinkField.tsx
 * Description: The centre of the top bar: a rounded field that reads the open video's title and takes a
 *   link. Click it, paste a link, Enter opens the video and adds it to the Videos
 *   list; Esc puts the title back. A small panel under it says what Enter does.
 */
import { useRef } from "react";
import { IconSearch } from "../../../shared/components/PanelIcons";
import { useAddVideoController } from "../hooks/useAddVideoController";

export default function TopBarLinkField() {
  const c = useAddVideoController();
  const input = useRef<HTMLInputElement>(null);
  c.bindInput(input);
  return (
    <div className="[-webkit-app-region:no-drag] absolute left-1/2 top-1/2 w-[460px] max-w-[calc(100%-400px)] -translate-x-1/2 -translate-y-1/2">
      <div
        className={`relative flex h-[36px] items-center gap-[8px] rounded-full border bg-raised px-[12px] ${
          c.editing ? "border-ice" : "border-hairlineStrong"
        }`}
      >
        <span className="text-fg-dim" aria-hidden="true">
          <IconSearch width={14} height={14} />
        </span>
        <input
          ref={input}
          id="ui-topbar-link"
          type="text"
          spellCheck={false}
          autoComplete="off"
          aria-label="Open or add a video: paste a YouTube link"
          placeholder="Paste a YouTube link"
          value={c.editing ? c.text : c.title}
          onFocus={c.onFocus}
          onBlur={c.onBlur}
          onChange={(e) => c.setText(e.target.value)}
          onKeyDown={c.onKeyDown}
          className="min-w-0 flex-1 truncate bg-transparent text-body font-medium text-fg outline-none placeholder:text-fg-dim"
        />
      </div>
      {c.editing ? (
        <div
          role="status"
          className="absolute left-0 right-0 top-[42px] z-30 rounded-panel border border-hairlineStrong bg-raised p-[8px] text-meta text-fg-dim"
        >
          {c.problem ? (
            <p className="m-[0px] px-[8px] py-[6px] text-error">{c.problem}</p>
          ) : c.canAdd ? (
            <>
              <div className="flex h-[32px] items-center justify-between rounded-control bg-hover px-[8px] text-body text-fg">
                <span>{c.addsNew ? "Add this video" : "Open this video"}</span>
                <span className="text-meta text-fg-dim">Enter</span>
              </div>
              <p className="m-[0px] px-[8px] pt-[6px]">
                {c.addsNew ? `Opens it${c.campaign ? ` for ${c.campaign}` : ""}. Nothing is downloaded yet.` : "It is already in your Videos list."}
              </p>
            </>
          ) : (
            <p className="m-[0px] px-[8px] py-[6px]">Paste a YouTube link</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
