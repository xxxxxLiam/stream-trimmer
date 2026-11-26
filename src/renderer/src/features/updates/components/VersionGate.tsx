/**
 * File: VersionGate.tsx
 * Path: src/renderer/src/features/updates/components/VersionGate.tsx
 * Description: Wraps the app. Below the server's minimum version it shows the "Please update" screen instead of the
 *   workspace; otherwise (including when the gate could not be asked) it shows the app untouched.
 */
import type { ReactNode } from "react";
import { useVersionGateQueries } from "../hooks/useVersionGateQueries";
import { DOWNLOAD_URL } from "../utils/versionGate";
import PleaseUpdateScreen from "./PleaseUpdateScreen";

export default function VersionGate({ children }: { children: ReactNode }) {
  const gate = useVersionGateQueries();
  if (!gate?.blocked || !gate.required) return <>{children}</>;
  return (
    <PleaseUpdateScreen
      current={gate.current}
      required={gate.required}
      onDownload={() => window.open(DOWNLOAD_URL, "_blank", "noopener")}
      onQuit={() => window.close()}
    />
  );
}
