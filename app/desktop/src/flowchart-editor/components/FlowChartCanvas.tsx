import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";

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

type FlowChartCanvasProps = {
  status: "idle" | "loading" | "ready" | "error";
  errorMessage: string | null;
  activeDocument: FlowChartFileDocument | null;
  nodeDefinitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>;
  selection: FlowChartSelection;
  pendingConnection: PendingFlowChartConnection | null;
  onSelectNode: (nodeId: number, mode?: SelectionMode) => void;
  onSelectNodes: (nodeIds: number[], mode?: SelectionMode, focusNodeId?: number) => void;
  onSelectConnection: (kind: FlowChartConnectionKind, connectionKey: string, mode?: SelectionMode) => void;
  onClearSelection: () => void;
  onMoveSelectedNodes: (nodeIds: number[], delta: { x: number; y: number }) => void;
  onBeginConnection: (kind: FlowChartConnectionKind, sourceNodeId: number, sourcePortId: number) => void;
  onCompleteConnection: (targetNodeId: number, targetPortId: number) => void;
  onCancelPendingConnection: () => void;
  onOpenAddNodeDialog: () => void;
  onAlignSelectedNodes: (mode: AlignMode) => void;
  onDistributeSelectedNodes: (axis: DistributionAxis) => void;
  onAutoLayoutNodes: () => void;
  selectedNodeCount: number;
};

const minZoom = 0.5;
const maxZoom = 2;

function clampZoom(zoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(zoom * 100) / 100));
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
    y: node.layout.y + sectionStart + metrics.sectionHeaderHeight + index * metrics.portRowHeight + metrics.portRowHeight / 2,
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

export function FlowChartCanvas({
  status,
  errorMessage,
  activeDocument,
  nodeDefinitionsByType,
  selection,
  pendingConnection,
  onSelectNode,
  onSelectNodes,
  onSelectConnection,
  onClearSelection,
  onMoveSelectedNodes,
  onBeginConnection,
  onCompleteConnection,
  onCancelPendingConnection,
  onOpenAddNodeDialog,
  onAlignSelectedNodes,
  onDistributeSelectedNodes,
  onAutoLayoutNodes,
  selectedNodeCount,
}: FlowChartCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<{
    nodeIds: number[];
    lastX: number;
    lastY: number;
  } | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const [marqueeState, setMarqueeState] = useState<{
    anchorX: number;
    anchorY: number;
    currentX: number;
    currentY: number;
    mode: SelectionMode;
  } | null>(null);
  const [viewportMetrics, setViewportMetrics] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const stageSize = useMemo(() => {
    if (!activeDocument) {
      return {
        width: 1600,
        height: 960,
      };
    }

    let maxX = 1600;
    let maxY = 960;
    activeDocument.nodes.forEach((node) => {
      const definition = nodeDefinitionsByType[node.nodeType];
      const metrics = getFlowChartNodeLayoutMetrics(definition);
      maxX = Math.max(maxX, node.layout.x + flowChartNodeWidth + 280);
      maxY = Math.max(maxY, node.layout.y + metrics.height + 220);
    });

    return {
      width: maxX,
      height: maxY,
    };
  }, [activeDocument, nodeDefinitionsByType]);

  const nodesById = useMemo(() => new Map(activeDocument?.nodes.map((node) => [node.nodeId, node]) ?? []), [activeDocument]);
  const selectedNodeIdSet = useMemo(() => new Set(selection.nodeIds), [selection.nodeIds]);
  const selectedFlowKeySet = useMemo(() => new Set(selection.flowConnectionKeys), [selection.flowConnectionKeys]);
  const selectedComputeKeySet = useMemo(() => new Set(selection.computeConnectionKeys), [selection.computeConnectionKeys]);

  const updateViewportMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    setViewportMetrics({
      left: viewport.scrollLeft / zoom,
      top: viewport.scrollTop / zoom,
      width: viewport.clientWidth / zoom,
      height: viewport.clientHeight / zoom,
    });
  }, [zoom]);

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return null;
      }

      const rect = viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left + viewport.scrollLeft) / zoom,
        y: (clientY - rect.top + viewport.scrollTop) / zoom,
      };
    },
    [zoom],
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
        x: (pointerClientX - rect.left + viewport.scrollLeft) / zoom,
        y: (pointerClientY - rect.top + viewport.scrollTop) / zoom,
      };

      setZoom(clampedZoom);
      requestAnimationFrame(() => {
        const currentViewport = viewportRef.current;
        if (!currentViewport) {
          return;
        }

        currentViewport.scrollLeft = logicalPoint.x * clampedZoom - (pointerClientX - rect.left);
        currentViewport.scrollTop = logicalPoint.y * clampedZoom - (pointerClientY - rect.top);
        updateViewportMetrics();
      });
    },
    [updateViewportMetrics, zoom],
  );

  useEffect(() => {
    updateViewportMetrics();
  }, [stageSize.height, stageSize.width, updateViewportMetrics]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      updateViewportMetrics();
    };

    viewport.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [updateViewportMetrics]);

  useEffect(() => {
    if (!dragState && !marqueeState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
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
      setDragState(null);

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
  }, [activeDocument, dragState, getCanvasPointFromClient, marqueeState, nodeDefinitionsByType, onClearSelection, onMoveSelectedNodes, onSelectNodes]);

  useEffect(() => {
    setDragState(null);
    setMarqueeState(null);
    setPointerPosition(null);
  }, [activeDocument]);

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) {
      return;
    }

    const margin = 8;
    const nextX = Math.min(Math.max(contextMenuState.x, margin), Math.max(margin, window.innerWidth - contextMenuRef.current.offsetWidth - margin));
    const nextY = Math.min(Math.max(contextMenuState.y, margin), Math.max(margin, window.innerHeight - contextMenuRef.current.offsetHeight - margin));
    if (nextX !== contextMenuState.x || nextY !== contextMenuState.y) {
      setContextMenuState((current) => (current ? { x: nextX, y: nextY } : current));
    }
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

    return buildCurvePath(sourceAnchor, pointerPosition);
  }, [activeDocument, nodeDefinitionsByType, nodesById, pendingConnection, pointerPosition]);

  const marqueeRect = marqueeState
    ? buildSelectionRect(marqueeState.anchorX, marqueeState.anchorY, marqueeState.currentX, marqueeState.currentY)
    : null;

  const minimapViewportRect = {
    x: viewportMetrics.left,
    y: viewportMetrics.top,
    width: Math.min(stageSize.width, viewportMetrics.width),
    height: Math.min(stageSize.height, viewportMetrics.height),
  };
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
    setContextMenuState({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleNodeHeaderMouseDown(event: ReactMouseEvent<HTMLDivElement>, node: FlowChartNodeInstance) {
    if (event.button !== 0) {
      return;
    }

    const selectionMode = getPointerSelectionMode(event);
    if (selectionMode !== "replace") {
      event.stopPropagation();
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

    setDragState({
      nodeIds: dragNodeIds,
      lastX: point.x,
      lastY: point.y,
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    const nextZoom = zoom * (event.deltaY < 0 ? 1.1 : 0.9);
    zoomAt(nextZoom, event.clientX, event.clientY);
  }

  function handleMinimapMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min((rect.width - 12) / stageSize.width, (rect.height - 12) / stageSize.height);
    const contentWidth = stageSize.width * scale;
    const contentHeight = stageSize.height * scale;
    const offsetX = (rect.width - contentWidth) / 2;
    const offsetY = (rect.height - contentHeight) / 2;
    const logicalX = Math.max(0, Math.min(stageSize.width, (event.clientX - rect.left - offsetX) / scale));
    const logicalY = Math.max(0, Math.min(stageSize.height, (event.clientY - rect.top - offsetY) / scale));

    viewport.scrollLeft = logicalX * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = logicalY * zoom - viewport.clientHeight / 2;
    updateViewportMetrics();
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
        className="flowchart-canvas-viewport"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onContextMenu={openCanvasContextMenu}
        onWheel={handleWheel}
        ref={viewportRef}
      >
        <div className="flowchart-canvas-stage-sizer" style={{ width: stageSize.width * zoom, height: stageSize.height * zoom }}>
          <div className="flowchart-canvas-stage" style={{ width: stageSize.width, height: stageSize.height, transform: `scale(${zoom})` }}>
            <svg className="flowchart-canvas-svg" viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}>
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

                const connectionKey = buildFlowChartConnectionKey(connection);
                return (
                  <g key={`flow-${connectionKey}`}>
                    <path
                      className={`flowchart-connection-hitbox${selectedFlowKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(sourceAnchor, targetAnchor)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectConnection("flow", connectionKey, getPointerSelectionMode(event.nativeEvent));
                      }}
                    />
                    <path
                      className={`flowchart-connection-path flowchart-connection-path--flow${selectedFlowKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(sourceAnchor, targetAnchor)}
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

                const connectionKey = buildFlowChartConnectionKey(connection);
                return (
                  <g key={`compute-${connectionKey}`}>
                    <path
                      className={`flowchart-connection-hitbox${selectedComputeKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(sourceAnchor, targetAnchor)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectConnection("compute", connectionKey, getPointerSelectionMode(event.nativeEvent));
                      }}
                    />
                    <path
                      className={`flowchart-connection-path flowchart-connection-path--compute${selectedComputeKeySet.has(connectionKey) ? " is-selected" : ""}`}
                      d={buildCurvePath(sourceAnchor, targetAnchor)}
                    />
                  </g>
                );
              })}

              {previewPath ? <path className={`flowchart-connection-path flowchart-connection-preview is-${pendingConnection?.kind ?? "flow"}`} d={previewPath} /> : null}
            </svg>

            {marqueeRect ? (
              <div
                className="flowchart-marquee"
                style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.width, height: marqueeRect.height }}
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
                    openCanvasContextMenu(event);
                  }}
                  style={{ left: node.layout.x, top: node.layout.y, width: flowChartNodeWidth, minHeight: metrics.height }}
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

                                    onSelectNode(node.nodeId, "replace");
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
                                    onBeginConnection("compute", node.nodeId, port.portId);
                                    onSelectNode(node.nodeId, "replace");
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

                                    onSelectNode(node.nodeId, "replace");
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
                                    onBeginConnection("flow", node.nodeId, port.portId);
                                    onSelectNode(node.nodeId, "replace");
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

      <div className="flowchart-minimap" onMouseDown={handleMinimapMouseDown} role="presentation">
        <div className="flowchart-minimap-header">小地图</div>
        <svg className="flowchart-minimap-canvas" viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}>
          <rect className="flowchart-minimap-background" height={stageSize.height} width={stageSize.width} x={0} y={0} />
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

            return <path className="flowchart-minimap-path is-flow" d={buildCurvePath(sourceAnchor, targetAnchor)} key={`minimap-flow-${buildFlowChartConnectionKey(connection)}`} />;
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

            return <path className="flowchart-minimap-path is-compute" d={buildCurvePath(sourceAnchor, targetAnchor)} key={`minimap-compute-${buildFlowChartConnectionKey(connection)}`} />;
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
                x={node.layout.x}
                y={node.layout.y}
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
          <button className="tree-context-menu-item" onClick={() => {
            setContextMenuState(null);
            onOpenAddNodeDialog();
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
}