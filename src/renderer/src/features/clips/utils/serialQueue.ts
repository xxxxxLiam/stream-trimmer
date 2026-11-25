/**
 * File: serialQueue.ts
 * Path: src/renderer/src/features/clips/utils/serialQueue.ts
 * Description: Runs jobs one after another. "Make this clip" while another clip is making joins the
 *   line instead of starting a second download over the first; a job that fails never blocks the
 *   ones behind it. Pure.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(job: () => Promise<T>): Promise<T> {
      const next = tail.then(job, job);
      tail = next.catch(() => {});
      return next;
    },
  };
}
