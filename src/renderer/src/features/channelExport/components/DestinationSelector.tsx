/**
 * File: DestinationSelector.tsx
 * Path: src/renderer/src/features/channelExport/components/DestinationSelector.tsx
 * Description: Where exported channel data saves. This is the campaign's DATA folder, kept
 *   apart from the clips folder (BUILD-SPEC section 5). Shown inside the channel exporter.
 *   A suggested folder is confirmed here or in the footer.
 */
import { useState } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";

export default function DestinationSelector() {
  const { isElectron } = useClipperContext();
  const { active, folders, pickDataDir, confirmDataDir } = useCampaign();
  const [problem, setProblem] = useState("");

  if (!isElectron) {
    return (
      <div className="rounded-control border border-dashed border-hairline px-3 py-2 text-meta text-fg-dim">
        Files save to your browser's Downloads folder. Use the desktop app to pick a folder.
      </div>
    );
  }

  const dir = folders.dataDir;
  const change = async () => setProblem((await pickDataDir()) ?? "");

  return (
    <div className="flex flex-col gap-2 rounded-control border border-hairline bg-panel-raised px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta text-fg-dim">
          {active ? `Data folder for ${active.name}` : "Data folder"}
        </span>
        <button type="button" className="btn" onClick={() => void change()}>
          {dir ? "Change folder" : "Choose folder"}
        </button>
      </div>
      {dir ? (
        <span className="break-all font-mono text-meta" title={dir}>
          {dir}
        </span>
      ) : (
        <span className="text-meta text-fg-dim">Not set</span>
      )}
      {dir && !folders.dataDirConfirmed && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-meta text-fg-dim">
            Suggested. Kept apart from your clips.
          </span>
          <button type="button" className="btn" onClick={confirmDataDir}>
            Use folder
          </button>
        </div>
      )}
      {problem && (
        <span role="alert" className="text-meta text-accent">
          {problem}
        </span>
      )}
    </div>
  );
}
