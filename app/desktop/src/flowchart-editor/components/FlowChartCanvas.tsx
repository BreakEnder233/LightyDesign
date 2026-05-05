import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";

import { clampContextMenuPosition } from "../../utils/appHelpers";

import type {
  FlowChartConnection,
  FlowChartConnectionKind,
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
  FlowChartSelection,
  PendingFlowChartConnection,
} from "../types/flowchartEditor";
import {
  buildFlowChartConnectionKey,
  findNodePropertyValue,
  flowChartNodeWidth,
  formatFlowChartTypeRef,
  getFlowChartNodeLayoutMetrics,
} from "../utils/flowchartDocument";

type SelectionMode = "replace" | "add" | "toggle";
type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
type DistributionAxis = "horizontal" | "vertical";
type CanvasPoint = { x: number; y: number };
type CanvasBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type ContextMenuState = {
  x: number;
  y: number;
  target:
    | {
        kind: "canvas";
        canvasPoint: CanvasPoint | null;
      }
    | {
        kind: "node";
        nodeId: number;
      };
};

type FlowChartCanvasProps = {
  status: "idle" | "loading" | "ready" | "error";
  errorMessage: string | null;
  documentKey: string | null;
  activeDocument: FlowChartFileDocument | null;
  nodeDefinitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>;
  selection: FlowChartSelection;
  pendingConnection: PendingFlowChartConnection | null;
  onSelectNode: (nodeId: number, mode?: SelectionMode) => void;
  onSelectNodes: (nodeIds: number[], mode?: SelectionMode, focusNodeId?: number) => void;
  onSelectConnection: (kind: FlowChartConnectionKind, connectionKey: string, mode?: SelectionMode) => void;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onPushUndoEntry: () => void;
  onMoveSelectedNodes: (nodeIds: number[], delta: { x: number; y: number }) => void;
  onBeginConnection: (kind: FlowChartConnectionKind, sourceNodeId: number, sourcePortId: number) => void;
  onCompleteConnection: (targetNodeId: number, targetPortId: number) => void;
  onCancelPendingConnection: () => void;
  onDisconnectPort: (nodeId: number, kind: FlowChartConnectionKind, portId: number) => void;
  onOpenAddNodeDialog: (position?: CanvasPoint) => void;
  onAlignSelectedNodes: (mode: AlignMode) => void;
  onDistributeSelectedNodes: (axis: DistributionAxis) => void;
  onAutoLayoutNodes: () => void;
  selectedNodeCount: number;
  /** Called whenever zoom or viewOrigin changes, so parent can sync toolbar display */
  onViewTransformChange?: (transform: { zoom: number; viewOrigin: CanvasPoint }) => void;
  /** Called when a node definition is dragged from the sidebar tree and dropped onto the canvas */
  onDropNodeDefinition?: (nodeType: string, position: { x: number; y: number }) => void;
};

export type FlowChartCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  getZoom: () => number;
  getViewOrigin: () => CanvasPoint;
};

const minZoom = 0.5;
const maxZoom = 2;
const defaultCanvasBounds: CanvasBounds = {
  minX: 0,
  minY: 0,
  maxX: 1600,
  maxY: 960,
};
const canvasViewportPadding = 240;
const minimapPadding = 120;

function clampZoom(zoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(zoom * 100) / 100));
}

function buildCanvasRect(bounds: CanvasBounds) {
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

function unionCanvasBounds(left: CanvasBounds, right: CanvasBounds): CanvasBounds {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

function expandCanvasBounds(bounds: CanvasBounds, padding: number): CanvasBounds {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

function getDocumentCanvasBounds(
  activeDocument: FlowChartFileDocument | null,
  nodeDefinitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>,
): CanvasBounds {
  if (!activeDocument || activeDocument.nodes.length === 0) {
    return defaultCanvasBounds;
  }

  const [firstNode] = activeDocument.nodes;
  const firstMetrics = getFlowChartNodeLayoutMetrics(nodeDefinitionsByType[firstNode.nodeType]);
  return activeDocument.nodes.reduce<CanvasBounds>((bounds, node) => {
    const metrics = getFlowChartNodeLayoutMetrics(nodeDefinitionsByType[node.nodeType]);
    return {
      minX: Math.min(bounds.minX, node.layout.x),
      minY: Math.min(bounds.minY, node.layout.y),
      maxX: Math.max(bounds.maxX, node.layout.x + flowChartNodeWidth),
      maxY: Math.max(bounds.maxY, node.layout.y + metrics.height),
    };
  }, {
    minX: firstNode.layout.x,
    minY: firstNode.layout.y,
    maxX: firstNode.layout.x + flowChartNodeWidth,
    maxY: firstNode.layout.y + firstMetrics.height,
  });
}

function offsetCanvasPoint(point: CanvasPoint, origin: CanvasPoint) {
  return {
    x: point.x - origin.x,
    y: point.y - origin.y,
  };
}

function getPointerSelectionMode(event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">): SelectionMode {
  if (event.ctrlKey || event.metaKey) {
    return "toggle";
  }

  if (event.shiftKey) {
    return "add";
  }

  return "replace";
}

function formatNodePropertyValue(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "<default>";
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : "<empty>";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "<json>";
  }
}

function buildCurvePath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const horizontalDistance = Math.max(72, Math.abs(target.x - source.x) * 0.45);
  return `M ${source.x} ${source.y} C ${source.x + horizontalDistance} ${source.y}, ${target.x - horizontalDistance} ${target.y}, ${target.x} ${target.y}`;
}

function buildPortAnchor(
  node: FlowChartNodeInstance,
  definition: FlowChartNodeDefinitionDocument | undefined,
  kind: FlowChartConnectionKind,
  portId: number,
) {
  if (!definition) {
    return null;
  }

  const metrics = getFlowChartNodeLayoutMetrics(definition);
  const ports = kind === "flow" ? definition.flowPorts : definition.computePorts;
  const index = ports.findIndex((port) => port.portId === portId);
  if (index < 0) {
    return null;
  }

  const sectionStart = kind === "flow" ? metrics.flowSectionStart : metrics.computeSectionStart;
  const port = ports[index];
  return {
    x: node.layout.x + (port.direction === "input" ? 0 : flowChartNodeWidth),
    y:
      node.layout.y
      + sectionStart
      + metrics.sectionBorderHeight
      + metrics.sectionHeaderHeight
      + index * metrics.portRowHeight
      + metrics.portRowHeight / 2,
  };
}

function buildSelectionRect(anchorX: number, anchorY: number, currentX: number, currentY: number) {
  return {
    x: Math.min(anchorX, currentX),
    y: Math.min(anchorY, currentY),
    width: Math.abs(currentX - anchorX),
    height: Math.abs(currentY - anchorY),
  };
}

function rectIntersectsNode(
  rect: ReturnType<typeof buildSelectionRect>,
  node: FlowChartNodeInstance,
  definition: FlowChartNodeDefinitionDocument | undefined,
) {
  const metrics = getFlowChartNodeLayoutMetrics(definition);
  return !(
    rect.x + rect.width < node.layout.x ||
    rect.y + rect.height < node.layout.y ||
    rect.x > node.layout.x + flowChartNodeWidth ||
    rect.y > node.layout.y + metrics.height
  );
}

export const FlowChartCanvas = forwardRef<FlowChartCanvasHandle, FlowChartCanvasProps>(function FlowChartCanvas({
  status,
  errorMessage,
  documentKey,
  activeDocument,
  nodeDefinitionsByType,
  selection,
  pendingConnection,
  onSelectNode,
  onSelectNodes,
  onSelectConnection,
  onClearSelection,
  onDeleteSelection,
  onPushUndoEntry,
  onMoveSelectedNodes,
  onBeginConnection,
  onCompleteConnection,
  onCancelPendingConnection,
  onDisconnectPort,
  onOpenAddNodeDialog,
  onAlignSelectedNodes,
  onDistributeSelectedNodes,
  onAutoLayoutNodes,
  selectedNodeCount,
  onViewTransformChange,
  onDropNodeDefinition,
}: FlowChartCanvasProps, ref: React.ForwardedRef<FlowChartCanvasHandle>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewOrigin, setViewOrigin] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{
    nodeIds: number[];
    lastX: number;
    lastY: number;
  } | null>(null);
  const [panState, setPanState] = useState<{
    startClientX: number;
    startClientY: number;
    startOriginX: number;
    startOriginY: number;
  } | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const [marqueeState, setMarqueeState] = useState<{
    anchorX: number;
    anchorY: number;
    currentX: number;
    currentY: number;
    mode: SelectionMode;
  } | null>(null);
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const initialViewAppliedDocumentKeyRef = useRef<string | null>(null);
  const [minimapDragState, setMinimapDragState] = useState<{
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);

  const nodesById = useMemo(() => new Map(activeDocument?.nodes.map((node) => [node.nodeId, node]) ?? []), [activeDocument]);
  const selectedNodeIdSet = useMemo(() => new Set(selection.nodeIds), [selection.nodeIds]);
  const selectedFlowKeySet = useMemo(() => new Set(selection.flowConnectionKeys), [selection.flowConnectionKeys]);
  const selectedComputeKeySet = useMemo(() => new Set(selection.computeConnectionKeys), [selection.computeConnectionKeys]);
  const documentBounds = useMemo(
    () => getDocumentCanvasBounds(activeDocument, nodeDefinitionsByType),
    [activeDocument, nodeDefinitionsByType],
  );
  const viewportMetrics = useMemo(() => ({
    left: viewOrigin.x,
    top: viewOrigin.y,
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom,
  }), [viewOrigin.x, viewOrigin.y, viewportSize.height, viewportSize.width, zoom]);
  const viewportBounds = useMemo<CanvasBounds>(() => ({
    minX: viewportMetrics.left,
    minY: viewportMetrics.top,
    maxX: viewportMetrics.left + viewportMetrics.width,
    maxY: viewportMetrics.top + viewportMetrics.height,
  }), [viewportMetrics.height, viewportMetrics.left, viewportMetrics.top, viewportMetrics.width]);
  const stageBounds = useMemo(
    () => expandCanvasBounds(unionCanvasBounds(documentBounds, viewportBounds), canvasViewportPadding),
    [documentBounds, viewportBounds],
  );
  const stageRect = useMemo(() => buildCanvasRect(stageBounds), [stageBounds]);
  const stageOrigin = useMemo(() => ({ x: stageBounds.minX, y: stageBounds.minY }), [stageBounds.minX, stageBounds.minY]);
  const stageTransform = useMemo(
    () => `translate(${-(viewOrigin.x - stageOrigin.x) * zoom}px, ${-(viewOrigin.y - stageOrigin.y) * zoom}px) scale(${zoom})`,
    [stageOrigin.x, stageOrigin.y, viewOrigin.x, viewOrigin.y, zoom],
  );
  const minimapBounds = useMemo(
    () => expandCanvasBounds(documentBounds, minimapPadding),
    [documentBounds],
  );
  const minimapRect = useMemo(() => buildCanvasRect(minimapBounds), [minimapBounds]);
  const minimapOrigin = useMemo(() => ({ x: minimapBounds.minX, y: minimapBounds.minY }), [minimapBounds.minX, minimapBounds.minY]);

  const updateViewportSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const nextWidth = viewport.clientWidth;
    const nextHeight = viewport.clientHeight;
    setViewportSize((current) => {
      if (current.width === nextWidth && current.height === nextHeight) {
        return current;
      }
      return { width: nextWidth, height: nextHeight };
    });
  }, []);

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return null;
      }

      const rect = viewport.getBoundingClientRect();
      return {
        x: viewOrigin.x + (clientX - rect.left) / zoom,
        y: viewOrigin.y + (clientY - rect.top) / zoom,
      };
    },
    [viewOrigin.x, viewOrigin.y, zoom],
  );

  const zoomAt = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number) => {
      const viewport = viewportRef.current;
      const clampedZoom = clampZoom(nextZoom);
      if (!viewport || clampedZoom === zoom) {
        setZoom(clampedZoom);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const fallbackClientX = rect.left + viewport.clientWidth / 2;
      const fallbackClientY = rect.top + viewport.clientHeight / 2;
      const pointerClientX = clientX ?? fallbackClientX;
      const pointerClientY = clientY ?? fallbackClientY;
      const logicalPoint = {
        x: viewOrigin.x + (pointerClientX - rect.left) / zoom,
        y: viewOrigin.y + (pointerClientY - rect.top) / zoom,
      };

      setZoom(clampedZoom);
      setViewOrigin({
        x: logicalPoint.x - (pointerClientX - rect.left) / clampedZoom,
        y: logicalPoint.y - (pointerClientY - rect.top) / clampedZoom,
      });
    },
    [viewOrigin.x, viewOrigin.y, zoom],
  );

  const zoomIn = useCallback(() => {
    zoomAt(zoom * 1.2);
  }, [zoom, zoomAt]);

  const zoomOut = useCallback(() => {
    zoomAt(zoom * 0.8);
  }, [zoom, zoomAt]);

  const zoomToFit = useCallback(() => {
    const bounds = documentBounds;
    if (bounds.minX === 0 && bounds.minY === 0 && bounds.maxX === 0 && bounds.maxY === 0) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const docWidth = bounds.maxX - bounds.minX;
    const docHeight = bounds.maxY - bounds.minY;
    if (docWidth <= 0 || docHeight <= 0) {
      return;
    }

    const padding = 80;
    const scaleX = (viewport.clientWidth - padding * 2) / docWidth;
    const scaleY = (viewport.clientHeight - padding * 2) / docHeight;
    const fitZoom = clampZoom(Math.min(scaleX, scaleY));

    setZoom(fitZoom);
    setViewOrigin({
      x: bounds.minX - (viewport.clientWidth / fitZoom - docWidth) / 2,
      y: bounds.minY - (viewport.clientHeight / fitZoom - docHeight) / 2,
    });
  }, [documentBounds]);

  // Notify parent of zoom/viewport changes for toolbar sync
  // Use a ref to avoid depending on the callback identity, which is an inline
  // function from FlowChartEditorView and would create an infinite re-render loop.
  const onViewTransformChangeRef = useRef(onViewTransformChange);
  onViewTransformChangeRef.current = onViewTransformChange;
  useEffect(() => {
    if (onViewTransformChangeRef.current) {
      onViewTransformChangeRef.current({ zoom, viewOrigin });
    }
  }, [zoom, viewOrigin]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      zoomToFit,
      getZoom: () => zoom,
      getViewOrigin: () => viewOrigin,
    }),
    [zoomIn, zoomOut, zoomToFit, zoom, viewOrigin],
  );

  useLayoutEffect(() => {
    updateViewportSize();
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    // Re-measure whenever the viewport becomes available or the document changes
    updateViewportSize();

    const resizeObserver = new ResizeObserver(() => {
      updateViewportSize();
    });

    resizeObserver.observe(viewport);
    window.addEventListener("resize", updateViewportSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [updateViewportSize, documentKey]);

  useEffect(() => {
    if (!dragState && !marqueeState && !panState && !minimapDragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (panState) {
        setViewOrigin({
          x: panState.startOriginX - (event.clientX - panState.startClientX) / zoom,
          y: panState.startOriginY - (event.clientY - panState.startClientY) / zoom,
        });
        return;
      }
      if (minimapDragState) {
        const minimap = minimapRef.current;
        if (!minimap) {
          return;
        }

        const rect = minimap.getBoundingClientRect();
        const scale = Math.min((rect.width - 12) / minimapRect.width, (rect.height - 12) / minimapRect.height);
        const contentWidth = minimapRect.width * scale;
        const contentHeight = minimapRect.height * scale;
        const offsetX = (rect.width - contentWidth) / 2;
        const offsetY = (rect.height - contentHeight) / 2;
        const logicalX = minimapOrigin.x + Math.max(0, Math.min(minimapRect.width, (event.clientX - rect.left - offsetX) / scale));
        const logicalY = minimapOrigin.y + Math.max(0, Math.min(minimapRect.height, (event.clientY - rect.top - offsetY) / scale));

        setViewOrigin({
          x: logicalX - minimapDragState.pointerOffsetX,
          y: logicalY - minimapDragState.pointerOffsetY,
        });
        return;
      }
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      setPointerPosition(point);

      if (dragState) {
        const delta = {
          x: point.x - dragState.lastX,
          y: point.y - dragState.lastY,
        };
        if (delta.x !== 0 || delta.y !== 0) {
          onMoveSelectedNodes(dragState.nodeIds, delta);
          setDragState((current) => (current ? { ...current, lastX: point.x, lastY: point.y } : current));
        }
        return;
      }

      if (marqueeState) {
        setMarqueeState((current) => (current ? { ...current, currentX: point.x, currentY: point.y } : current));
      }
    };

    const handleMouseUp = () => {
      setPanState(null);
      setDragState(null);
      setMinimapDragState(null);

      if (!marqueeState || !activeDocument) {
        setMarqueeState(null);
        return;
      }

      const rect = buildSelectionRect(marqueeState.anchorX, marqueeState.anchorY, marqueeState.currentX, marqueeState.currentY);
      const selectedNodeIds = activeDocument.nodes
        .filter((node) => rectIntersectsNode(rect, node, nodeDefinitionsByType[node.nodeType]))
        .map((node) => node.nodeId);

      if (rect.width < 4 && rect.height < 4 && marqueeState.mode === "replace") {
        onClearSelection();
      } else if (selectedNodeIds.length > 0) {
        onSelectNodes(selectedNodeIds, marqueeState.mode, selectedNodeIds[selectedNodeIds.length - 1]);
      } else if (marqueeState.mode === "replace") {
        onClearSelection();
      }

      setMarqueeState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDocument, dragState, getCanvasPointFromClient, marqueeState, nodeDefinitionsByType, onClearSelection, onMoveSelectedNodes, onSelectNodes, panState, zoom, minimapDragState, minimapRect, minimapOrigin]);

  useEffect(() => {
    initialViewAppliedDocumentKeyRef.current = null;
    setDragState(null);
    setPanState(null);
    setMarqueeState(null);
    setPointerPosition(null);
    setContextMenuState(null);
    setMinimapDragState(null);
  }, [documentKey]);

  useEffect(() => {
    if (!documentKey) {
      setViewOrigin({ x: 0, y: 0 });
      setZoom(1);
      initialViewAppliedDocumentKeyRef.current = null;
      return;
    }

    if (!activeDocument || initialViewAppliedDocumentKeyRef.current === documentKey) {
      return;
    }

    setViewOrigin({
      x: Math.max(0, documentBounds.minX - 160),
      y: Math.max(0, documentBounds.minY - 120),
    });
    setZoom(1);
    initialViewAppliedDocumentKeyRef.current = documentKey;
  }, [activeDocument, documentBounds.minX, documentBounds.minY, documentKey]);

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) {
      return;
    }

    const nextPosition = clampContextMenuPosition(
      contextMenuState.x,
      contextMenuState.y,
      contextMenuRef.current.offsetWidth,
      contextMenuRef.current.offsetHeight,
    );

    contextMenuRef.current.style.left = `${nextPosition.x}px`;
    contextMenuRef.current.style.top = `${nextPosition.y}px`;
  }, [contextMenuState]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".flowchart-canvas-context-menu")) {
        return;
      }

      setContextMenuState(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuState]);

  const previewPath = useMemo(() => {
    if (!pendingConnection || !activeDocument || !pointerPosition) {
      return null;
    }

    const sourceNode = nodesById.get(pendingConnection.sourceNodeId);
    if (!sourceNode) {
      return null;
    }

    const sourceAnchor = buildPortAnchor(
      sourceNode,
      nodeDefinitionsByType[sourceNode.nodeType],
      pendingConnection.kind,
      pendingConnection.sourcePortId,
    );
    if (!sourceAnchor) {
      return null;
    }

    return buildCurvePath(offsetCanvasPoint(sourceAnchor, stageOrigin), offsetCanvasPoint(pointerPosition, stageOrigin));
  }, [activeDocument, nodeDefinitionsByType, nodesById, pendingConnection, pointerPosition, stageOrigin]);

  const marqueeRect = marqueeState
    ? buildSelectionRect(marqueeState.anchorX, marqueeState.anchorY, marqueeState.currentX, marqueeState.currentY)
    : null;

  const minimapViewportRect = (() => {
    const vpLocal = {
      x: viewportMetrics.left - minimapOrigin.x,
      y: viewportMetrics.top - minimapOrigin.y,
      width: viewportMetrics.width,
      height: viewportMetrics.height,
    };
    const x = Math.max(0, vpLocal.x);
    const y = Math.max(0, vpLocal.y);
    const right = Math.min(minimapRect.width, vpLocal.x + vpLocal.width);
    const bottom = Math.min(minimapRect.height, vpLocal.y + vpLocal.height);
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  })();
  const canAlignSelection = selectedNodeCount >= 2;
  const canDistributeSelection = selectedNodeCount >= 3;
  const canAutoLayout = selectedNodeCount >= 2 || (activeDocument?.nodes.length ?? 0) >= 2;

  function handleCanvasMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setPointerPosition(point);
  }

  function handleCanvasMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button === 1) {
      event.preventDefault();
      setPanState({
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOriginX: viewOrigin.x,
        startOriginY: viewOrigin.y,
      });
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".flowchart-node-card")) {
      return;
    }

    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.preventDefault();

    if (pendingConnection) {
      onCancelPendingConnection();
    }

    setMarqueeState({
      anchorX: point.x,
      anchorY: point.y,
      currentX: point.x,
      currentY: point.y,
      mode: getPointerSelectionMode(event),
    });
  }

  function openCanvasContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    const canvasPoint = getCanvasPointFromClient(event.clientX, event.clientY);
    setContextMenuState({
      x: event.clientX,
      y: event.clientY,
      target: {
        kind: "canvas",
        canvasPoint,
      },
    });
  }

  function openNodeContextMenu(event: ReactMouseEvent<HTMLElement>, nodeId: number) {
    event.preventDefault();
    setContextMenuState({
      x: event.clientX,
      y: event.clientY,
      target: {
        kind: "node",
        nodeId,
      },
    });
  }

  function handleNodeHeaderMouseDown(event: ReactMouseEvent<HTMLDivElement>, node: FlowChartNodeInstance) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selectionMode = getPointerSelectionMode(event);
    if (selectionMode !== "replace") {
      onSelectNode(node.nodeId, selectionMode);
      return;
    }

    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const dragNodeIds = selectedNodeIdSet.has(node.nodeId) ? selection.nodeIds : [node.nodeId];
    if (!selectedNodeIdSet.has(node.nodeId)) {
      onSelectNode(node.nodeId, "replace");
    }

    onPushUndoEntry();
    setDragState({
      nodeIds: dragNodeIds,
      lastX: point.x,
      lastY: point.y,
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const nextZoom = zoom * (event.deltaY < 0 ? 1.1 : 0.9);
      zoomAt(nextZoom, event.clientX, event.clientY);
      return;
    }

    event.preventDefault();
    setViewOrigin((current) => ({
      x: current.x + event.deltaX / zoom,
      y: current.y + event.deltaY / zoom,
    }));
  }

  function handleMinimapMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    const minimapEl = minimapRef.current ?? event.currentTarget;
    const rect = minimapEl.getBoundingClientRect();
    const scale = Math.min((rect.width - 12) / minimapRect.width, (rect.height - 12) / minimapRect.height);
    const contentWidth = minimapRect.width * scale;
    const contentHeight = minimapRect.height * scale;
    const offsetX = (rect.width - contentWidth) / 2;
    const offsetY = (rect.height - contentHeight) / 2;
    const localX = Math.max(0, Math.min(minimapRect.width, (event.clientX - rect.left - offsetX) / scale));
    const localY = Math.max(0, Math.min(minimapRect.height, (event.clientY - rect.top - offsetY) / scale));
    const logicalX = minimapOrigin.x + localX;
    const logicalY = minimapOrigin.y + localY;

    // 如果点击在视口矩形内部，则进入拖拽视口模式
    const insideViewport =
      localX >= minimapViewportRect.x &&
      localX <= minimapViewportRect.x + minimapViewportRect.width &&
      localY >= minimapViewportRect.y &&
      localY <= minimapViewportRect.y + minimapViewportRect.height;

    if (insideViewport) {
      setMinimapDragState({
        pointerOffsetX: logicalX - viewOrigin.x,
        pointerOffsetY: logicalY - viewOrigin.y,
      });
      event.stopPropagation();
      return;
    }

    // 否则视为点击跳转到该位置
    setViewOrigin({
      x: logicalX - viewportMetrics.width / 2,
      y: logicalY - viewportMetrics.height / 2,
    });
    event.stopPropagation();
  }

  if (status === "loading") {
    return (
      <div className="viewer-empty-state flowchart-empty-state">
        <strong>正在加载流程图</strong>
        <p>正在读取当前流程图定义与节点实例。</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="viewer-empty-state is-error flowchart-empty-state">
        <strong>流程图加载失败</strong>
        <p>{errorMessage ?? "未能读取当前流程图文件。"}</p>
      </div>
    );
  }

  if (!activeDocument) {
    return (
      <div className="viewer-empty-state flowchart-empty-state">
        <strong>暂无已打开的流程图</strong>
        <p>从左侧选择一个流程图文件，或先打开包含 FlowCharts 的工作区。</p>
      </div>
    );
  }

  return (
    <div className="flowchart-canvas-shell">
      <div
        className={`flowchart-canvas-viewport${panState ? " is-panning" : ""}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onContextMenu={openCanvasContextMenu}
        onWheel={handleWheel}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/plain")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const nodeType = event.dataTransfer.getData("text/plain");
          if (!nodeType || !onDropNodeDefinition) return;

          const viewport = event.currentTarget as HTMLElement;
          const rect = viewport.getBoundingClientRect();
          const screenX = event.clientX - rect.left;
          const screenY = event.clientY - rect.top;

          onDropNodeDefinition(nodeType, { x: screenX, y: screenY });
        }}
        ref={viewportRef}
      >
        <div className="flowchart-canvas-stage-sizer">
          <div className="flowchart-canvas-stage" style={{ width: stageRect.width, height: stageRect.height, transform: stageTransform }}>
            <svg className="flowchart-canvas-svg" viewBox={`0 0 ${stageRect.width} ${stageRect.height}`}>
              {activeDocument.flowConnections.map((connection) => {
                const sourceNode = nodesById.get(connection.sourceNodeId);
                const targetNode = nodesById.get(connection.targetNodeId);
                if (!sourceNode || !targetNode) {
                  return null;
                }

                const sourceAnchor = buildPortAnchor(sourceNode, nodeDefinitionsByType[sourceNode.nodeType], "flow", connection.sourcePortId);
                const targetAnchor = buildPortAnchor(targetNode, nodeDefinitionsByType[targetNode.nodeType], "flow", connection.targetPortId);
                if (!sourceAnchor || !targetAnchor) {
                  return null;
                }

                const localSourceAnchor = offsetCanvasPoint(sourceAnchor, stageOrigin);
                const localTargetAnchor = offsetCanvasPoint(targetAnchor, stageOrigin);

                const connectionKey = buildFlowChartConnectionKey(connection);
                return (
                  <g key={`flow-${connectionKey}`}>
                    <path
                      className={`flowchart-connection-hitbox${selectedFlowKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(localSourceAnchor, localTargetAnchor)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectConnection("flow", connectionKey, getPointerSelectionMode(event.nativeEvent));
                      }}
                    />
                    <path
                      className={`flowchart-connection-path flowchart-connection-path--flow${selectedFlowKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(localSourceAnchor, localTargetAnchor)}
                    />
                  </g>
                );
              })}

              {activeDocument.computeConnections.map((connection) => {
                const sourceNode = nodesById.get(connection.sourceNodeId);
                const targetNode = nodesById.get(connection.targetNodeId);
                if (!sourceNode || !targetNode) {
                  return null;
                }

                const sourceAnchor = buildPortAnchor(sourceNode, nodeDefinitionsByType[sourceNode.nodeType], "compute", connection.sourcePortId);
                const targetAnchor = buildPortAnchor(targetNode, nodeDefinitionsByType[targetNode.nodeType], "compute", connection.targetPortId);
                if (!sourceAnchor || !targetAnchor) {
                  return null;
                }

                const localSourceAnchor = offsetCanvasPoint(sourceAnchor, stageOrigin);
                const localTargetAnchor = offsetCanvasPoint(targetAnchor, stageOrigin);

                const connectionKey = buildFlowChartConnectionKey(connection);
                return (
                  <g key={`compute-${connectionKey}`}>
                    <path
                      className={`flowchart-connection-hitbox${selectedComputeKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(localSourceAnchor, localTargetAnchor)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectConnection("compute", connectionKey, getPointerSelectionMode(event.nativeEvent));
                      }}
                    />
                    <path
                      className={`flowchart-connection-path flowchart-connection-path--compute${selectedComputeKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(localSourceAnchor, localTargetAnchor)}
                    />
                  </g>
                );
              })}

              {previewPath ? <path className={`flowchart-connection-path flowchart-connection-preview is-${pendingConnection?.kind ?? "flow"}`} d={previewPath} /> : null}
            </svg>

            {marqueeRect ? (
              <div
                className="flowchart-marquee"
                style={{ left: marqueeRect.x - stageOrigin.x, top: marqueeRect.y - stageOrigin.y, width: marqueeRect.width, height: marqueeRect.height }}
              />
            ) : null}

            {activeDocument.nodes.map((node) => {
              const definition = nodeDefinitionsByType[node.nodeType];
              const metrics = getFlowChartNodeLayoutMetrics(definition);
              return (
                <div
                  className={`flowchart-node-card${selectedNodeIdSet.has(node.nodeId) ? " is-selected" : ""}${definition ? ` is-${definition.nodeKind}` : " is-missing"}`}
                  key={node.nodeId}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectNode(node.nodeId, getPointerSelectionMode(event.nativeEvent));
                  }}
                  onContextMenu={(event) => {
                    event.stopPropagation();
                    if (!selectedNodeIdSet.has(node.nodeId)) {
                      onSelectNode(node.nodeId, "replace");
                    }
                    openNodeContextMenu(event, node.nodeId);
                  }}
                  style={{ left: node.layout.x - stageOrigin.x, top: node.layout.y - stageOrigin.y, width: flowChartNodeWidth, minHeight: metrics.height }}
                >
                  <div className="flowchart-node-header" onMouseDown={(event) => handleNodeHeaderMouseDown(event, node)}>
                    <div className="flowchart-node-title-block">
                      <span>{node.nodeType}</span>
                      <strong>{definition?.alias ?? definition?.name ?? node.nodeType}</strong>
                    </div>
                    <span className={`flowchart-kind-badge${definition ? ` is-${definition.nodeKind}` : ""}`}>{definition?.nodeKind ?? "missing"}</span>
                  </div>

                  {!definition ? (
                    <div className="flowchart-node-missing">
                      <strong>节点定义缺失</strong>
                      <p>未能解析 {node.nodeType}，请检查工作区中的节点定义文件。</p>
                    </div>
                  ) : (
                    <>
                      {definition.properties.length > 0 ? (
                        <div className="flowchart-node-section">
                          <div className="flowchart-node-section-header">属性</div>
                          {definition.properties.map((property) => (
                            <div className="flowchart-node-property-row" key={property.propertyId}>
                              <span>{property.alias ?? property.name}</span>
                              <strong>{formatNodePropertyValue(findNodePropertyValue(node, property.propertyId) ?? property.defaultValue)}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {definition.computePorts.length > 0 ? (
                        <div className="flowchart-node-section">
                          <div className="flowchart-node-section-header">计算端口</div>
                          {definition.computePorts.map((port) => (
                            <div className={`flowchart-port-row is-${port.direction}`} key={`compute-${port.portId}`}>
                              {port.direction === "input" ? (
                                <button
                                  className="flowchart-port-handle is-compute"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (pendingConnection?.kind === "compute") {
                                      onCompleteConnection(node.nodeId, port.portId);
                                      return;
                                    }

                                    onBeginConnection("compute", node.nodeId, port.portId);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onDisconnectPort(node.nodeId, "compute", port.portId);
                                  }}
                                  type="button"
                                />
                              ) : <span className="flowchart-port-handle-spacer" />}

                              <div className="flowchart-port-copy">
                                <strong>{port.alias ?? port.name}</strong>
                                <span>{formatFlowChartTypeRef(port.type)}</span>
                              </div>

                              {port.direction === "output" ? (
                                <button
                                  className="flowchart-port-handle is-compute"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (pendingConnection?.kind === "compute") {
                                      onCompleteConnection(node.nodeId, port.portId);
                                      return;
                                    }

                                    onBeginConnection("compute", node.nodeId, port.portId);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onDisconnectPort(node.nodeId, "compute", port.portId);
                                  }}
                                  type="button"
                                />
                              ) : <span className="flowchart-port-handle-spacer" />}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {definition.flowPorts.length > 0 ? (
                        <div className="flowchart-node-section">
                          <div className="flowchart-node-section-header">流程端口</div>
                          {definition.flowPorts.map((port) => (
                            <div className={`flowchart-port-row is-${port.direction}`} key={`flow-${port.portId}`}>
                              {port.direction === "input" ? (
                                <button
                                  className="flowchart-port-handle is-flow"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (pendingConnection?.kind === "flow") {
                                      onCompleteConnection(node.nodeId, port.portId);
                                      return;
                                    }

                                    onBeginConnection("flow", node.nodeId, port.portId);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onDisconnectPort(node.nodeId, "flow", port.portId);
                                  }}
                                  type="button"
                                />
                              ) : <span className="flowchart-port-handle-spacer" />}

                              <div className="flowchart-port-copy">
                                <strong>{port.alias ?? port.name}</strong>
                                <span>{port.direction === "input" ? "流程输入" : "流程输出"}</span>
                              </div>

                              {port.direction === "output" ? (
                                <button
                                  className="flowchart-port-handle is-flow"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (pendingConnection?.kind === "flow") {
                                      onCompleteConnection(node.nodeId, port.portId);
                                      return;
                                    }

                                    onBeginConnection("flow", node.nodeId, port.portId);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onDisconnectPort(node.nodeId, "flow", port.portId);
                                  }}
                                  type="button"
                                />
                              ) : <span className="flowchart-port-handle-spacer" />}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flowchart-minimap" onMouseDown={handleMinimapMouseDown} role="presentation" ref={minimapRef}>
        <div className="flowchart-minimap-header">小地图</div>
        <svg className="flowchart-minimap-canvas" viewBox={`0 0 ${minimapRect.width} ${minimapRect.height}`}>
          <rect className="flowchart-minimap-background" height={minimapRect.height} width={minimapRect.width} x={0} y={0} />
          {activeDocument.flowConnections.map((connection) => {
            const sourceNode = nodesById.get(connection.sourceNodeId);
            const targetNode = nodesById.get(connection.targetNodeId);
            if (!sourceNode || !targetNode) {
              return null;
            }

            const sourceAnchor = buildPortAnchor(sourceNode, nodeDefinitionsByType[sourceNode.nodeType], "flow", connection.sourcePortId);
            const targetAnchor = buildPortAnchor(targetNode, nodeDefinitionsByType[targetNode.nodeType], "flow", connection.targetPortId);
            if (!sourceAnchor || !targetAnchor) {
              return null;
            }

            return <path className="flowchart-minimap-path is-flow" d={buildCurvePath(offsetCanvasPoint(sourceAnchor, minimapOrigin), offsetCanvasPoint(targetAnchor, minimapOrigin))} key={`minimap-flow-${buildFlowChartConnectionKey(connection)}`} />;
          })}
          {activeDocument.computeConnections.map((connection) => {
            const sourceNode = nodesById.get(connection.sourceNodeId);
            const targetNode = nodesById.get(connection.targetNodeId);
            if (!sourceNode || !targetNode) {
              return null;
            }

            const sourceAnchor = buildPortAnchor(sourceNode, nodeDefinitionsByType[sourceNode.nodeType], "compute", connection.sourcePortId);
            const targetAnchor = buildPortAnchor(targetNode, nodeDefinitionsByType[targetNode.nodeType], "compute", connection.targetPortId);
            if (!sourceAnchor || !targetAnchor) {
              return null;
            }

            return <path className="flowchart-minimap-path is-compute" d={buildCurvePath(offsetCanvasPoint(sourceAnchor, minimapOrigin), offsetCanvasPoint(targetAnchor, minimapOrigin))} key={`minimap-compute-${buildFlowChartConnectionKey(connection)}`} />;
          })}
          {activeDocument.nodes.map((node) => {
            const definition = nodeDefinitionsByType[node.nodeType];
            const metrics = getFlowChartNodeLayoutMetrics(definition);
            return (
              <rect
                className={`flowchart-minimap-node${selectedNodeIdSet.has(node.nodeId) ? " is-selected" : ""}`}
                height={metrics.height}
                key={`minimap-node-${node.nodeId}`}
                width={flowChartNodeWidth}
                x={node.layout.x - minimapOrigin.x}
                y={node.layout.y - minimapOrigin.y}
              />
            );
          })}
          <rect
            className="flowchart-minimap-viewport"
            height={minimapViewportRect.height}
            width={minimapViewportRect.width}
            x={minimapViewportRect.x}
            y={minimapViewportRect.y}
          />
        </svg>
      </div>

      {contextMenuState ? (
        <div className="tree-context-menu flowchart-canvas-context-menu" ref={contextMenuRef} style={{ left: contextMenuState.x, top: contextMenuState.y }}>
          {contextMenuState.target.kind === "canvas" ? (
            <>
              <button className="tree-context-menu-item" onClick={() => {
                const targetPosition = contextMenuState.target.kind === "canvas" ? contextMenuState.target.canvasPoint ?? undefined : undefined;
                setContextMenuState(null);
                onOpenAddNodeDialog(targetPosition);
              }} type="button">
                新建节点
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("left");
              }} type="button">
                左对齐
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("center");
              }} type="button">
                水平居中
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("right");
              }} type="button">
                右对齐
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("top");
              }} type="button">
                顶对齐
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("middle");
              }} type="button">
                垂直居中
              </button>
              <button className="tree-context-menu-item" disabled={!canAlignSelection} onClick={() => {
                setContextMenuState(null);
                onAlignSelectedNodes("bottom");
              }} type="button">
                底对齐
              </button>
              <button className="tree-context-menu-item" disabled={!canDistributeSelection} onClick={() => {
                setContextMenuState(null);
                onDistributeSelectedNodes("horizontal");
              }} type="button">
                水平分布
              </button>
              <button className="tree-context-menu-item" disabled={!canDistributeSelection} onClick={() => {
                setContextMenuState(null);
                onDistributeSelectedNodes("vertical");
              }} type="button">
                垂直分布
              </button>
              <button className="tree-context-menu-item" disabled={!canAutoLayout} onClick={() => {
                setContextMenuState(null);
                onAutoLayoutNodes();
              }} type="button">
                自动排版
              </button>
              <button className="tree-context-menu-item" onClick={() => {
                setContextMenuState(null);
                zoomAt(zoom - 0.1);
              }} type="button">
                缩小
              </button>
              <button className="tree-context-menu-item" onClick={() => {
                setContextMenuState(null);
                zoomAt(1);
              }} type="button">
                100%
              </button>
              <button className="tree-context-menu-item" onClick={() => {
                setContextMenuState(null);
                zoomAt(zoom + 0.1);
              }} type="button">
                放大
              </button>
            </>
          ) : (
            <button className="tree-context-menu-item" onClick={() => {
              setContextMenuState(null);
              onDeleteSelection();
            }} type="button">
              {selectedNodeCount > 1 ? "删除所选节点" : "删除节点"}
            </button>
          )}
          {pendingConnection ? (
            <button className="tree-context-menu-item" onClick={() => {
              setContextMenuState(null);
              onCancelPendingConnection();
            }} type="button">
              取消连线
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});