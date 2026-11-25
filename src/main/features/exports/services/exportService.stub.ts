/**
 * File: exportService.stub.ts
 * Path: src/main/features/exports/services/exportService.stub.ts
 * Description: Stand-in for ./exportService. scripts/build-main.cjs aliases to this in any build without
 *   VITE_ENABLE_CHANNEL_DATA, so the exporter's save code never reaches the public app.
 */
export async function saveExport(_payload: unknown): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Could not save." };
}
