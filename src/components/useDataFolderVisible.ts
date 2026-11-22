/**
 * File: useDataFolderVisible.ts
 * Path: src/components/useDataFolderVisible.ts
 * Description: Whether to show the Data folder at all. It is only used by the channel exporter,
 *   which public builds leave out, so everyone else is not asked for a folder that does nothing.
 *   The stored value is kept either way.
 */
import { CHANNEL_DATA_BUILT, useOwnerAccess } from "../lib/ownerGate";
import { dataFolderVisible } from "../lib/campaigns";

export function useDataFolderVisible(): boolean {
  const ownerAccess = useOwnerAccess();
  return dataFolderVisible(CHANNEL_DATA_BUILT, ownerAccess);
}
