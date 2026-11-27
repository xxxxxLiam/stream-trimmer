/**
 * File: OfflineRow.tsx
 * Path: src/renderer/src/features/clips/components/OfflineRow.tsx
 * Description: A clip whose connection went (board 03.6.2, "Before a clip starts, and offline"): "No connection."
 *   then what happens next, on the clip's own row. No pill and no red; the progress bar stops where it was.
 *   The cut carries on by itself when the connection is back. Logic-free.
 */
export type OfflineRowProps = { name: string; percent: number };

export default function OfflineRow({ name, percent }: OfflineRowProps) {
  return (
    <div role="group" aria-label={`${name}: No connection.`} className="relative mx-[10px] mb-[6px] mt-[10px] flex-none overflow-hidden rounded-control bg-raised px-[10px] py-[9px]">
      <div className="text-body font-medium leading-[normal]">{name}</div>
      <div className="mt-[3px] text-meta leading-[1.45]">
        <span className="text-fg">No connection.</span> <span className="text-fg-dim">It picks up where it stopped when the connection is back.</span>
      </div>
      <span aria-hidden="true" className="absolute bottom-0 left-0 h-[2px] bg-hover" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}
