import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FlowChartConnection,
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
} from "../types/flowchartEditor";
import { FlowChartInspector } from "./FlowChartInspector";

type FlowChartFloatingInspectorProps = {
  activeDocument: FlowChartFileDocument | null;
  selectedNode: FlowChartNodeInstance | null;
  selectedNodeCount: number;
  selectedNodeDefinition: FlowChartNodeDefinitionDocument | null;
  selectedConnection: {
    kind: "flow" | "compute";
    connection: FlowChartConnection;
  } | null;
  selectedConnectionCount: number;
  onDeleteSelection: () => void;
  onDeleteSelectedNode: () => void;
  onDeleteSelectedConnection: () => void;
  onUpdateNodePropertyValue: (nodeId: number, propertyId: number, value: unknown) => void;
  onResetNodePropertyValue: (nodeId: number, propertyId: number) => void;
  /** Viewport transform info for converting canvas coords to screen coords */
  canvasTransform: { zoom: number; viewOrigin: { x: number; y: number } } | null;
  /** Pixel position of the canvas viewport element relative to the page */
  canvasRect: DOMRectReadOnly | null;
  onClose: () => void;
};

export function FlowChartFloatingInspector({
  activeDocument,
  selectedNode,
  selectedNodeCount,
  selectedNodeDefinition,
  selectedConnection,
  selectedConnectionCount,
  onDeleteSelection,
  onDeleteSelectedNode,
  onDeleteSelectedConnection,
  onUpdateNodePropertyValue,
  onResetNodePropertyValue,
  canvasTransform,
  canvasRect,
  onClose,
}: FlowChartFloatingInspectorProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  // Track whether the user has manually dragged the panel to prevent auto-reposition
  const userDraggedRef = useRef(false);
  // Track which node the panel is currently positioned over
  const positionedNodeIdRef = useRef<number | null>(null);

  // Compute initial position based on selected node's canvas position
  // Skips recalculation if the user has already manually dragged this panel
  // for the same node (preserves manual positioning across property edits).
  useEffect(() => {
    if (!selectedNode || !canvasTransform || !canvasRect) {
      return;
    }

    // If the user has already dragged this panel for the current node,
    // do NOT reset its position — respect the user's manual placement.
    if (userDraggedRef.current && positionedNodeIdRef.current === selectedNode.nodeId) {
      return;
    }

    positionedNodeIdRef.current = selectedNode.nodeId;
    userDraggedRef.current = false;

    const nodeX = selectedNode.layout.x;
    const nodeY = selectedNode.layout.y;
    const screenX = canvasRect.left + (nodeX - canvasTransform.viewOrigin.x) * canvasTransform.zoom;
    const screenY = canvasRect.top + (nodeY - canvasTransform.viewOrigin.y) * canvasTransform.zoom;

    // Place to the right of the node, with a small offset
    const nodeScreenWidth = 292 * canvasTransform.zoom;
    let left = screenX + nodeScreenWidth + 16;
    let top = screenY;

    // Keep within viewport bounds
    const panelWidth = 320;
    const panelHeight = 400;
    if (left + panelWidth > window.innerWidth - 16) {
      // Place to the left instead
      left = screenX - panelWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }
    if (top + panelHeight > window.innerHeight - 16) {
      top = window.innerHeight - panelHeight - 16;
    }
    if (top < 60) {
      top = 60;
    }

    setPosition({ x: left, y: top });
  }, [selectedNode, canvasTransform, canvasRect]);

  // Close on Escape
  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, onClose]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!position) {
        return;
      }

      event.preventDefault();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startPanelX = position.x;
      const startPanelY = position.y;

      userDraggedRef.current = true;

      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        setPosition({
          x: startPanelX + (moveEvent.clientX - startClientX),
          y: startPanelY + (moveEvent.clientY - startClientY),
        });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [position],
  );

  if (!selectedNode || !activeDocument) {
    return null;
  }

  return (
    <div
      className="flowchart-floating-inspector"
      ref={panelRef}
      style={position ? { left: position.x, top: position.y } : { left: -9999, top: -9999 }}
    >
      <div className="flowchart-floating-inspector-header" onPointerDown={handlePointerDown}>
        <div className="section-header">
          <div>
            <p className="eyebrow">节点属性</p>
            <strong>{selectedNodeDefinition?.alias ?? selectedNodeDefinition?.name ?? selectedNode.nodeType}</strong>
          </div>
        </div>
        <button className="flowchart-floating-inspector-close" onClick={onClose} type="button" aria-label="关闭浮动面板">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flowchart-floating-inspector-body">
        <FlowChartInspector
          activeDocument={activeDocument}
          onDeleteSelection={onDeleteSelection}
          onDeleteSelectedConnection={onDeleteSelectedConnection}
          onDeleteSelectedNode={onDeleteSelectedNode}
          onResetNodePropertyValue={onResetNodePropertyValue}
          onUpdateNodePropertyValue={onUpdateNodePropertyValue}
          selectedConnection={selectedConnection}
          selectedConnectionCount={selectedConnectionCount}
          selectedNode={selectedNode}
          selectedNodeCount={selectedNodeCount}
          selectedNodeDefinition={selectedNodeDefinition}
        />
      </div>
    </div>
  );
}
