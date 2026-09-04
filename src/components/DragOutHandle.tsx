/**
 * File: DragOutHandle.tsx
 * Path: src/components/DragOutHandle.tsx
 * Description: Grab target that starts a native OS file drag out of the app.
 */
import { useState } from "react";
import type { DragEvent } from "react";
import { GripVertical } from "react-bootstrap-icons";

interface DragOutHandleProps {
  /** Absolute path of the file on disk. */
  path?: string | null;
  /** Whether the app is running inside Electron. */
  isElectron: boolean;
  /** Set false once an existence check shows the file is gone. */
  exists?: boolean;
  /** Accessible description of the dragged file. */
  label?: string;
}

/**
 * Renders nothing outside Electron: a browser page cannot hand a real file to
 * the operating system, so there is no meaningful drag to offer there.
 */
export default function DragOutHandle({
  path,
  isElectron,
  exists = true,
  label,
}: DragOutHandleProps) {
  const [dragging, setDragging] = useState(false);

  if (!isElectron || !path || !exists) return null;
  if (typeof window === "undefined" || !window.electronAPI?.startDrag) {
    return null;
  }

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    // Required: without preventDefault Chromium runs its own HTML5 drag and
    // the native OS drag never starts.
    event.preventDefault();
    setDragging(true);
    window.electronAPI?.startDrag?.(path);
    // The native drag takes over from here, so no dragend fires reliably.
    window.setTimeout(() => setDragging(false), 600);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      role="button"
      tabIndex={-1}
      aria-label={
        label ? `Drag ${label} to another app` : "Drag file to another app"
      }
      title="Drag to your editor"
      className={`flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-row border border-hairline bg-panel text-fg-faint transition-opacity active:cursor-grabbing hover:text-accent ${
        dragging ? "opacity-50" : "opacity-100"
      }`}
    >
      <GripVertical size={16} />
    </div>
  );
}
