import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { TreeViewRow } from "./TreeViewRow";
import { TreeViewDragLayer } from "./TreeViewDragLayer";
import type { TreeViewItem, DropTarget, DragPayload } from "./treeViewUtils";

type TreeViewProps = {
  items: TreeViewItem[];
  expandedKeys: Set<string>;
  selectedKey: string | null;
  searchKeyword: string;
  dragEnabled: boolean;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onContextMenu: (event: ReactMouseEvent, item: TreeViewItem) => void;
  onDrop: (source: DragPayload, target: DropTarget) => void;
  renderIcon: (item: TreeViewItem) => React.ReactNode;
  renderLabel: (item: TreeViewItem) => React.ReactNode;
  renderBadge: (item: TreeViewItem) => React.ReactNode;
};

type DragState = {
  payload: DragPayload;
  currentTarget: DropTarget | null;
  pointerStart: { x: number; y: number };
};

export function TreeView({
  items,
  expandedKeys,
  selectedKey,
  dragEnabled,
  onToggle,
  onSelect,
  onContextMenu,
  onDrop,
  renderIcon,
  renderLabel,
  renderBadge,
}: TreeViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | "inside" | null>(null);

  // ── Pointer-based drag system ──
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const registerDragEvents = useCallback(
    (element: HTMLElement | null, item: TreeViewItem) => {
      if (!element) {
        itemElementsRef.current.delete(item.id);
        return;
      }
      itemElementsRef.current.set(item.id, element);

      if (!dragEnabled || item.kind === "directory") {
        return;
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!pointerStartRef.current || draggingRef.current) return;
        const dx = event.clientX - pointerStartRef.current.x;
        const dy = event.clientY - pointerStartRef.current.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          draggingRef.current = true;
          setDragState({
            payload: {
              keys: [item.id],
              labels: [item.label],
            },
            currentTarget: null,
            pointerStart: pointerStartRef.current,
          });
        }
      };

      const handlePointerUp = () => {
        pointerStartRef.current = null;
        draggingRef.current = false;
      };

      element.addEventListener("pointerdown", handlePointerDown);
      element.addEventListener("pointermove", handlePointerMove);
      element.addEventListener("pointerup", handlePointerUp);
      element.addEventListener("pointercancel", handlePointerUp);
    },
    [dragEnabled],
  );

  // ── Drag-over detection on the scroll container ──
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragState) return;

      const y = event.clientY;
      let targetKey: string | null = null;
      let targetRect: DOMRect | null = null;

      for (const [key, element] of itemElementsRef.current) {
        const rect = element.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          targetKey = key;
          targetRect = rect;
          break;
        }
      }

      if (!targetKey || !targetRect) {
        setDragOverKey(null);
        setDragOverPosition(null);
        return;
      }

      setDragOverKey(targetKey);

      const relativeY = (y - targetRect.top) / targetRect.height;
      const targetItem = items.find((it) => it.id === targetKey);

      if (targetItem?.kind === "directory" && relativeY > 0.25 && relativeY < 0.75) {
        setDragOverPosition("inside");
      } else if (relativeY < 0.5) {
        setDragOverPosition("before");
      } else {
        setDragOverPosition("after");
      }
    },
    [dragState, items],
  );

  const handlePointerUp = useCallback(() => {
    if (dragState && dragOverKey && dragOverPosition) {
      const target: DropTarget = {
        kind: dragOverPosition === "inside" ? "directory" : "reorder",
        targetKey: dragOverKey,
        position: dragOverPosition,
      };
      onDrop(dragState.payload, target);
    }
    setDragState(null);
    setDragOverKey(null);
    setDragOverPosition(null);
    draggingRef.current = false;
    pointerStartRef.current = null;
  }, [dragState, dragOverKey, dragOverPosition, onDrop]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selectedKey) return;
      const currentIndex = items.findIndex((it) => it.id === selectedKey);
      if (currentIndex === -1) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (currentIndex < items.length - 1) {
            onSelect(items[currentIndex + 1].id);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          if (currentIndex > 0) {
            onSelect(items[currentIndex - 1].id);
          }
          break;
        case "ArrowRight":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory" && !expandedKeys.has(item.id)) {
              onToggle(item.id);
            }
          }
          break;
        case "ArrowLeft":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory" && expandedKeys.has(item.id)) {
              onToggle(item.id);
            }
          }
          break;
        case "Enter":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory") {
              onToggle(item.id);
            }
          }
          break;
      }
    },
    [items, selectedKey, expandedKeys, onToggle, onSelect],
  );

  return (
    <div
      className="tree-view"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      role="tree"
      tabIndex={0}
    >
      <div className="tree-view-scroll" ref={scrollRef}>
        {items.map((item) => (
          <TreeViewRow
            key={item.id}
            item={item}
            isExpanded={expandedKeys.has(item.id)}
            isSelected={selectedKey === item.id}
            isDragOver={dragOverKey === item.id}
            dragOverPosition={dragOverKey === item.id ? dragOverPosition : null}
            onToggle={onToggle}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            registerDragEvents={registerDragEvents}
            icon={renderIcon(item)}
            label={renderLabel(item)}
            badge={renderBadge(item)}
          />
        ))}
      </div>

      {dragState ? (
        <TreeViewDragLayer label={dragState.payload.labels[0]} count={dragState.payload.keys.length} />
      ) : null}
    </div>
  );
}
