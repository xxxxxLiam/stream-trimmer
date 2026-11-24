/**
 * File: concurrency.ts
 * Path: src/main/features/engine/services/channelExport/concurrency.ts
 * Description: Runs an async mapper over items with a small concurrency window.
 */


// Run an async mapper over items with a small concurrency window, preserving
// input order in the result array.
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}
