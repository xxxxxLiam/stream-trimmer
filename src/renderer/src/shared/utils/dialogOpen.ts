/**
 * File: dialogOpen.ts
 * Path: src/renderer/src/shared/utils/dialogOpen.ts
 * Description: Whether a drawer or dialog is open over the workspace. Single-letter shortcuts (the timeline
 *   tool keys, M for a flag) stay quiet while one is, so nothing changes behind it.
 */
export function dialogOpen(root: Pick<Document, "querySelector"> = document): boolean {
  // A4-1: the first-use Tip card is a dialog for screen readers but blocks nothing, and it asks for these very keys.
  return root.querySelector('[role="dialog"]:not([data-nonblocking]), [aria-modal="true"]:not([data-nonblocking])') !== null;
}
