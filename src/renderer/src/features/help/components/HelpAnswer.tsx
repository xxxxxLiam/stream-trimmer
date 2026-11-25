/**
 * File: HelpAnswer.tsx
 * Path: src/renderer/src/features/help/components/HelpAnswer.tsx
 * Description: Help, a question opened (Help.dc.html 2): Back shows "Help", the question is the
 *   title, the answer is plain paragraphs.
 */
import { DrawerHeader, drawerBodyRoomy } from "../../../shared/components/DrawerRows";
import type { HelpAnswer as Answer } from "../utils/helpContent";

export default function HelpAnswer({ answer, onBack, onClose }: { answer: Answer; onBack: () => void; onClose: () => void }) {
  return (
    <>
      <DrawerHeader title={answer.question} back="Help" onBack={onBack} closeName="Help" onClose={onClose} />
      <div className={drawerBodyRoomy}>
        {answer.paras.map((t) => (
          <p key={t} className="m-[0px] text-body leading-[20px] text-fg">{t}</p>
        ))}
      </div>
    </>
  );
}
