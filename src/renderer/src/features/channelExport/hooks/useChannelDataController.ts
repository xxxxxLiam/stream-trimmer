/**
 * File: useChannelDataController.ts
 * Path: src/renderer/src/features/channelExport/hooks/useChannelDataController.ts
 * Description: The one hook ChannelDataDrawer calls. Sets the run the sidebar offers (the top N by
 *   views, long-form only, videos.csv and transcripts.csv), checks the link, and starts the run. The run
 *   itself lives in ChannelExportContext, so it keeps going after the sidebar closes.
 */
import { useEffect, useState } from "react";
import { useChannelExportContext } from "./ChannelExportContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { folderChipLabel } from "../../../shared/utils/folderLabel";
import { isLikelyChannelUrl } from "../utils/channel";
import { DEFAULT_LIMIT, estimateLine, lastExportDetail, stepLimit } from "../utils/channelData";

export function useChannelDataController(open: boolean, onClose: () => void) {
  const c = useChannelExportContext();
  const { folders } = useCampaign();
  const [problem, setProblem] = useState("");

  // The sidebar always offers the same run: long-form only, details and transcripts, no comments.
  useEffect(() => {
    if (!open) return;
    c.setContentType("longform");
    c.setExportAll(false);
    c.togglePart("videoDetails", true);
    c.togglePart("comments", false);
    c.togglePart("transcripts", true);
    if (!Number(c.limitText)) c.setLimitText(String(DEFAULT_LIMIT));
    setProblem("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = Number(c.limitText) || DEFAULT_LIMIT;

  const start = () => {
    if (!isLikelyChannelUrl(c.channelUrl.trim())) {
      setProblem("Paste a channel link like youtube.com/@handle");
      return;
    }
    setProblem("");
    void c.startExport();
    onClose();
  };

  return {
    channelUrl: c.channelUrl,
    setChannelUrl: (v: string) => {
      setProblem("");
      c.setChannelUrl(v);
    },
    count,
    fewer: () => c.setLimitText(String(stepLimit(count, -1))),
    more: () => c.setLimitText(String(stepLimit(count, 1))),
    estimate: estimateLine(count),
    savesTo: folderChipLabel(folders.dataDir, 3),
    problem: problem || c.error,
    running: c.exporting,
    start,
    last: c.result ? { name: c.result.folder, detail: lastExportDetail(c.result), canOpen: !!c.result.path, onOpen: c.revealResult } : null,
  };
}
