/**
 * File: panels.tsx
 * Path: src/renderer/src/features/clips/panels.tsx
 * Description: Registers the right group's panels (Export, History) with the shell.
 *   Owned by the Export and History build: swap each for the real component here.
 */
import PanelPlaceholder from "../../modules/layout/components/PanelPlaceholder";
import { registerPanel } from "../../modules/layout/utils/panelRegistry";
import { usePanelHost } from "../../modules/layout/hooks/PanelHostContext";
import ClipsColumn from "./components/ClipsColumn";

function ExportPanel() {
  const { cutBanked } = usePanelHost();
  return <ClipsColumn onCutBanked={cutBanked} />;
}
registerPanel({ id: "export", title: "Export", group: "right", component: ExportPanel });

registerPanel({ id: "history", title: "History", group: "right", component: () => <PanelPlaceholder title="History" /> });
