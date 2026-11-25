/**
 * File: toolRetry.ts
 * Path: src/main/features/engine/services/download/toolRetry.ts
 * Description: When a clip fails because the download tools are out of date, update them once and try
 *   the clip once more. One retry, never a loop; a second failure is final.
 */

/** Set on the error that reaches the failure response once the one retry has been spent. */
export const RETRY_SPENT = "toolRetrySpent";

export interface ToolRetryOptions {
  /** True for the "tools out of date" class of error. */
  isToolError: (e: unknown) => boolean;
  /** Updates the tools. Calls `willUpdate` once a newer version is confirmed. Resolves true if updated. */
  update: (willUpdate: () => void) => Promise<boolean>;
  /** The row says "Clipr is updating its download tools and will try once more." */
  onRetrying: (e: unknown) => void;
  /** Runs before the retry (cancellation check, work-folder tidy). */
  beforeRetry?: () => void;
}

export async function runWithToolRetry<T>(build: () => Promise<T>, o: ToolRetryOptions): Promise<T> {
  try {
    return await build();
  } catch (first) {
    if (!o.isToolError(first)) throw first;
    let updated = false;
    try {
      updated = await o.update(() => o.onRetrying(first));
    } catch {
      updated = false;
    }
    if (!updated) throw mark(first);
    o.beforeRetry?.();
    try {
      return await build();
    } catch (second) {
      throw mark(second);
    }
  }
}

function mark(e: unknown) {
  if (e && typeof e === "object") (e as Record<string, unknown>)[RETRY_SPENT] = true;
  return e;
}
