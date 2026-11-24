/**
 * File: panels.tsx
 * Path: src/renderer/src/features/player/panels.tsx
 * Description: Registers the centre panels (Preview over Timeline) with the shell.
 *   Owned by the Preview and timeline build: swap each for the real component here.
 */
import { registerPanel } from "../../modules/layout/utils/panelRegistry";
import { usePanelHost } from "../../modules/layout/hooks/PanelHostContext";
import EditorHandoff from "../handoff/components/EditorHandoff";
import MarkBar from "../clips/components/MarkBar";
import DownloadBar from "../downloads/components/DownloadBar";
import PreviewPanel from "./components/PreviewPanel";
import Timeline from "./components/Timeline";

registerPanel({ id: "preview", title: "Preview", group: "centre", component: PreviewPanel });

function TimelineSlot() {
  const { cutSegments, editorHandoff } = usePanelHost();
  return (
    <div tabIndex={0} aria-label="Timeline" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <Timeline />
      <MarkBar onCut={cutSegments} />
      <DownloadBar />
      <div className="px-2 pb-2">
        <EditorHandoff {...editorHandoff} />
      </div>
    </div>
  );
}
registerPanel({ id: "timeline", title: "Timeline", group: "centre", component: TimelineSlot });
