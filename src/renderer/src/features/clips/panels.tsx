/**
 * File: panels.tsx
 * Path: src/renderer/src/features/clips/panels.tsx
 * Description: Registers the right group's panels (Export, History) with the shell.
 */
import HistoryPanel from "../downloads/components/HistoryPanel";
import { registerPanel } from "../../modules/layout/utils/panelRegistry";
import ExportPanel from "./components/ExportPanel";

registerPanel({ id: "export", title: "Export", group: "right", component: ExportPanel });
registerPanel({ id: "history", title: "History", group: "right", component: HistoryPanel });
