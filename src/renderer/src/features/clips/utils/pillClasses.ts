/**
 * File: pillClasses.ts
 * Path: src/renderer/src/features/clips/utils/pillClasses.ts
 * Description: The pill buttons on an Export row (boards 03.2.18 and 03.6.3): a 30px pill inside a
 *   44px hit area. Shared by the failed row and the handoff row.
 */
const PILL = "inline-flex h-[30px] items-center whitespace-nowrap rounded-[15px] border px-[12px] text-meta font-medium leading-[normal]";
export const PRIMARY_PILL = `${PILL} border-ice text-ice`;
export const QUIET_PILL = `${PILL} border-hairlineStrong bg-panel text-fg`;
export const PILL_HIT = "inline-flex h-[44px] flex-none items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost";
