/**
 * File: useVideoFlags.ts
 * Path: src/renderer/src/features/markers/hooks/useVideoFlags.ts
 * Description: The flags (seconds) of the open video, for the Markers panel. Stand-in until the
 *   timeline's flags store (shared/hooks/useFlagsState) is on this branch; then this returns its
 *   flags and nothing else changes.
 */
export function useVideoFlags(): { flags: number[] } {
  return { flags: [] };
}
