/**
 * File: panels.tsx
 * Path: src/renderer/src/features/player/panels.tsx
 * Description: Registers the centre panels with the shell: the Preview, and the Timeline under it.
 */
import { registerPanel } from "../../modules/layout/utils/panelRegistry";
import PreviewPanel from "./components/PreviewPanel";
import Timeline from "./components/Timeline";

registerPanel({ id: "preview", title: "Preview", group: "centre", component: PreviewPanel });
registerPanel({ id: "timeline", title: "Timeline", group: "centre", component: Timeline });
