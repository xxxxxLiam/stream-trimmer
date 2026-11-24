/**
 * File: panels.tsx
 * Path: src/renderer/src/features/transcript/panels.tsx
 * Description: Registers the left group's panels (Videos, Transcript, Markers) with the shell.
 *   Owned by the Left panels build: swap a placeholder for the real component here.
 *   Panels take no props; read the screen's state with usePanelHost() or a feature context.
 */
import PanelPlaceholder from "../../modules/layout/components/PanelPlaceholder";
import { registerPanel } from "../../modules/layout/utils/panelRegistry";
import { usePanelHost } from "../../modules/layout/hooks/PanelHostContext";
import VideosPanel from "../workspace/components/VideosPanel";
import TranscriptColumn from "./components/TranscriptColumn";

registerPanel({ id: "videos", title: "Videos", group: "left", component: VideosPanel });

function TranscriptPanel() {
  const { playhead } = usePanelHost();
  return <TranscriptColumn playhead={playhead} />;
}
registerPanel({ id: "transcript", title: "Transcript", group: "left", component: TranscriptPanel });

registerPanel({ id: "markers", title: "Markers", group: "left", component: () => <PanelPlaceholder title="Markers" /> });
