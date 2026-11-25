/**
 * File: CrashScreenHost.tsx
 * Path: src/renderer/src/features/help/components/CrashScreenHost.tsx
 * Description: Connects the crash screen to the report actions. Rendered by the top-level boundary.
 */
import CrashScreen from "../../../shared/components/CrashScreen";
import { useCrashReport } from "../hooks/useCrashReport";

export default function CrashScreenHost({ error }: { error: Error }) {
  const c = useCrashReport(error);
  return <CrashScreen state={c.state} copied={c.copied} onReopen={c.reopen} onSend={() => void c.send()} onCopy={() => void c.copy()} />;
}
