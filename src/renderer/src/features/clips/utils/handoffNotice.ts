/**
 * File: handoffNotice.ts
 * Path: src/renderer/src/features/clips/utils/handoffNotice.ts
 * Description: What the Export panel says about the editor handoff of the clip just made: the engine's
 *   plain reason when it failed (error tone), or that the editor opened and the file was shown when
 *   the editor can't take a project (CapCut, Premiere; info tone). Nothing when it simply worked, and
 *   nothing for another campaign's answer.
 */
import type { AfterCuttingAnswer } from "../../handoff/components/EditorHandoff";

export type HandoffNotice = { tone: "error" | "info"; message: string; clipPath?: string };

export function handoffNoticeFor(answer: AfterCuttingAnswer | null, campaignId: string | null): HandoffNotice | null {
  if (!answer || answer.campaignId !== campaignId) return null;
  const { outcome } = answer;
  const message = outcome.message.trim();
  if (!message) return null;
  if (!outcome.ok) return { tone: "error", message, clipPath: outcome.clipPath };
  if (/showed the clip/i.test(message)) return { tone: "info", message, clipPath: outcome.clipPath };
  return null;
}
