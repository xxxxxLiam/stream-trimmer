/**
 * File: CommentsExportCard.tsx
 * Path: src/components/CommentsExportCard.tsx
 * Description: Export tab card — exports all comments of the loaded video to CSV.
 */
import { Download, ChatLeftText } from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";

export default function CommentsExportCard() {
  const { info, exportComments, exportingComments, commentsNote } =
    useClipperContext();

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-hairline bg-panel-raised p-4">
      <div className="flex items-center gap-2">
        <ChatLeftText size={13} className="text-fg-muted" />
        <span className="text-[13px] font-medium text-fg">
          Video comments (CSV)
        </span>
      </div>
      <p className="text-[12px] text-fg-muted">
        {info
          ? `Exports every top-level comment and reply from “${info.title}”.`
          : "Search a video in the Clip tab, then export its comments here."}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={exportComments}
          disabled={!info || exportingComments}
          className="btn self-start text-[12px]"
        >
          <Download size={12} />
          <span>
            {exportingComments ? "Fetching comments…" : "Export comments"}
          </span>
        </button>
        {commentsNote && (
          <span className="text-[11px] text-fg-faint">{commentsNote}</span>
        )}
      </div>
    </div>
  );
}
