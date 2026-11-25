/**
 * File: PanelPlaceholder.tsx
 * Path: src/renderer/src/modules/layout/components/PanelPlaceholder.tsx
 * Description: What a panel shows until its feature builds the real one.
 */
export default function PanelPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[4px] p-[16px] text-center">
      <p className="m-0 text-body text-fg">{title}</p>
      <p className="m-0 text-meta text-fg-dim">This panel is not built yet.</p>
    </div>
  );
}
