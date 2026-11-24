/**
 * File: LaneLabel.tsx
 * Path: src/renderer/src/features/player/components/LaneLabel.tsx
 * Description: The 96px label column at the left of every timeline lane.
 */
export default function LaneLabel({ children }: { children?: string }) {
  return <span className="w-24 flex-none pl-4 text-meta text-fg-dim">{children}</span>;
}
