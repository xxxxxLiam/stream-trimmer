/**
 * File: ColdStartScreen.tsx
 * Path: src/renderer/src/features/start/components/ColdStartScreen.tsx
 * Description: Connects ColdStart to the clipper context, and shows the crash note above it after a crash. Shown while no video is open.
 */
import CrashNoteHost from "../../help/components/CrashNoteHost";
import ColdStart from "./ColdStart";
import TitleBarDrag from "../../../modules/layout/components/TitleBarDrag";
import { useStartController } from "../hooks/useStartController";

export default function ColdStartScreen() {
  return (
    <>
      <TitleBarDrag />
      {/* E3-4: a crash on this screen comes back with its note and Send report here too, not only at the top of Export. */}
      <div className="mx-auto w-full max-w-[680px]">
        <CrashNoteHost />
      </div>
      <ColdStart {...useStartController()} />
    </>
  );
}
