/**
 * File: StartFreshPrompt.tsx
 * Path: src/renderer/src/features/start/components/StartFreshPrompt.tsx
 * Description: Mounts the one-time start-fresh dialog when the main process says it is due.
 */
import { useStartFreshController } from "../hooks/useStartFreshController";
import StartFreshDialog from "./StartFreshDialog";

export default function StartFreshPrompt() {
  const c = useStartFreshController();
  if (!c.open) return null;
  return (
    <StartFreshDialog
      busy={c.busy}
      error={c.error}
      onStartFresh={c.onStartFresh}
      onKeep={c.onKeep}
    />
  );
}
