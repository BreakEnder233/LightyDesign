import { useEffect, useState } from "react";

type TreeViewDragLayerProps = {
  /** The label text being dragged */
  label: string;
  /** Number of items being dragged */
  count: number;
};

/**
 * A floating preview that follows the pointer during drag operations.
 * Rendered into a portal div at the document body level.
 */
export function TreeViewDragLayer({ label, count }: TreeViewDragLayerProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
    };

    document.addEventListener("pointermove", handlePointerMove);
    return () => document.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <div
      className="tree-view-drag-layer"
      style={{
        position: "fixed",
        left: position.x + 12,
        top: position.y - 18,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <span className="tree-view-drag-layer-label">{label}</span>
      {count > 1 ? <span className="badge">{count} 项</span> : null}
    </div>
  );
}
