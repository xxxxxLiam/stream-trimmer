/**
 * File: HelpAnswer.tsx
 * Path: src/renderer/src/features/help/components/HelpAnswer.tsx
 * Description: Help, a question opened (04.5.2, 04.5.5): the question as the title, numbered steps (a long answer
 *   groups them under plain labels, numbering carrying on), a small picture under a step that names a control,
 *   at most one note under the steps, and "Show me in Clipr" pinned at the bottom. The steps scroll by wheel,
 *   trackpad and keys with no visible bar; the area takes focus so the keys work.
 */
import { DrawerHeader } from "../../../shared/components/DrawerRows";
import { stepsOf, type HelpAnswer as Answer } from "../utils/helpContent";
import HelpStepPicture from "./HelpStepPicture";
import { PlayFill } from "react-bootstrap-icons";

export type HelpAnswerProps = { answer: Answer; onBack: () => void; onClose: () => void; onShowMe: () => void };

export default function HelpAnswer({ answer, onBack, onClose, onShowMe }: HelpAnswerProps) {
  let n = 0;
  const canShow = stepsOf(answer).some((s) => s.show);
  return (
    <>
      <DrawerHeader title={answer.question} back="Help" onBack={onBack} closeName="Help" onClose={onClose} />
      <div tabIndex={0} aria-label="Answer" className="mt-[12px] min-h-[0px] flex-1 overflow-y-auto outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost">
        {answer.groups.map((g, gi) => (
          <section key={g.label ?? gi} className={gi > 0 ? "mt-[16px]" : ""}>
            {g.label && <h4 className="m-[0px] mb-[8px] text-meta font-medium text-fg-dim">{g.label}</h4>}
            <ol start={n + 1} className="m-[0px] flex list-none flex-col gap-[12px] p-[0px]">
              {g.steps.map((s) => {
                n += 1;
                return (
                  <li key={s.text} className="flex flex-col">
                    <div className="flex items-start gap-[10px] text-body leading-[20px] text-fg">
                      <span className="inline-flex size-[20px] flex-none items-center justify-center rounded-full bg-raised text-meta">{n}</span>
                      <span>{s.text}</span>
                    </div>
                    {s.pic && <HelpStepPicture pic={s.pic} />}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {answer.note && <p className="m-[0px] mt-[14px] text-meta leading-[18px] text-fg-dim">{answer.note}</p>}
      </div>
      {canShow && (
        <div className="flex-none border-t border-hairline pt-[14px]">
          <button
            type="button"
            aria-label="Show me in Clipr: closes Help and runs these steps on the real controls"
            onClick={onShowMe}
            className="flex h-target w-full items-center justify-center gap-[8px] rounded-[22px] bg-ice text-body font-medium text-bg"
          >
            <PlayFill width={16} height={16} aria-hidden="true" focusable="false" />
            Show me in Clipr
          </button>
        </div>
      )}
    </>
  );
}
