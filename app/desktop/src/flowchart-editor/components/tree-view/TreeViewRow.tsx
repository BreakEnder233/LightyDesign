import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { TreeViewItem, DragPayload } from "./treeViewUtils";

type TreeViewRowProps = {
  item: TreeViewItem;
  isExpanded: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  dragOverPosition: "before" | "after" | "inside" | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (event: ReactMouseEvent, item: TreeViewItem) => void;
  registerDragEvents: (
    element: HTMLElement | null,
    item: TreeViewItem,
  ) => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  badge: React.ReactNode;
};

export function TreeViewRow({
  item,
  isExpanded,
  isSelected,
  isDragOver,
  dragOverPosition,
  onToggle,
  onSelect,
  onContextMenu,
  registerDragEvents,
  icon,
  label,
  badge,
}: TreeViewRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  const setRowRef = useCallback(
    (element: HTMLDivElement | null) => {
      rowRef.current = element;
      registerDragEvents(element, item);
    },
    [item, registerDragEvents],
  );

  const handleClick = useCallback(() => {
    if (item.kind === "directory") {
      onToggle(item.id);
    } else {
      onSelect(item.id);
    }
  }, [item.id, item.kind, onToggle, onSelect]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      onContextMenu(event, item);
    },
    [item, onContextMenu],
  );

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (item.kind === "directory") return;
    const entryKind = item.metadata.kind as string;
    if (entryKind === "node-definition") {
      event.dataTransfer.setData("text/plain", item.metadata.relativePath as string);
      event.dataTransfer.effectAllowed = "copy";
    }
  }, [item]);

  const rowClass = [
    "tree-view-row",
    `tree-view-row-${item.kind}`,
    isSelected ? "is-selected" : "",
    isDragOver ? "is-drag-over" : "",
    dragOverPosition ? `is-drag-${dragOverPosition}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setRowRef}
      className={rowClass}
      style={{ paddingLeft: 8 + item.depth * 18 }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable={item.kind === "leaf" && (item.metadata.kind as string) === "node-definition"}
      onDragStart={handleDragStart}
      role="treeitem"
      aria-expanded={item.kind === "directory" ? isExpanded : undefined}
      aria-selected={isSelected}
      tabIndex={0}
    >
      <span className="tree-view-row-expander">
        {item.kind === "directory" ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`tree-view-expander-icon${isExpanded ? " is-expanded" : ""}`}>
            <path d={isExpanded ? "M2 4l4 4 4-4" : "M4 2l4 4-4 4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : null}
      </span>
      <span className="tree-view-row-icon">{icon}</span>
      <span className="tree-view-row-label">{label}</span>
      <span className="tree-view-row-badge">{badge}</span>
    </div>
  );
}
