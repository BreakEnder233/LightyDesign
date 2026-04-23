import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../../utils/desktopHost";
import type {
  FlowChartCatalogResponse,
  FlowChartClipboardSnapshot,
  FlowChartConnection,
  FlowChartConnectionKind,
  FlowChartFileDocument,
  FlowChartFileResponse,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeDefinitionResponse,
  FlowChartNodeInstance,
  FlowChartSelection,
  PendingFlowChartConnection,
} from "../types/flowchartEditor";
import {
  buildFlowChartConnectionKey,
  cloneFlowChartFileDocument,
  flowChartNodeWidth,
  getFlowChartPortDescriptor,
  getFlowChartNodeRect,
  removeNodePropertyValue,
  upsertNodePropertyValue,
  validateFlowChartDocument,
} from "../utils/flowchartDocument";

type ToastInput = {
  title: string;
  summary?: string;
  detail?: string;
  source: "workspace" | "sheet" | "save" | "system";
  variant: "error" | "success";
  canOpenDetail: boolean;
  durationMs?: number;
};

type UseFlowChartEditorArgs = {
  hostInfo: DesktopHostInfo | null;
  workspacePath: string;
  onToast: (toast: ToastInput) => void;
};

type ActiveFlowChartState =
  | {
      status: "idle" | "loading";
      dirty: false;
      error?: undefined;
      response?: undefined;
      document?: undefined;
    }
  | {
      status: "error";
      dirty: false;
      error: string;
      response?: undefined;
      document?: undefined;
    }
  | {
      status: "ready";
      dirty: boolean;
      error?: undefined;
      response: FlowChartFileResponse;
      document: FlowChartFileDocument;
    };

type SelectionMode = "replace" | "add" | "toggle";

type ClipboardState = {
  snapshot: FlowChartClipboardSnapshot | null;
  pasteSequence: number;
};

type FlowChartAssetScope = "nodes" | "files";

type FlowChartAlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
type FlowChartDistributionAxis = "horizontal" | "vertical";

function buildEmptySelection(): FlowChartSelection {
  return {
    nodeIds: [],
    flowConnectionKeys: [],
    computeConnectionKeys: [],
    focus: null,
  };
}

function uniqNumbers(values: number[]) {
  return Array.from(new Set(values));
}

function uniqStrings(values: string[]) {
  return Array.from(new Set(values));
}

function encodeFlowChartRelativePath(relativePath: string) {
  return relativePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildApiUrl(hostInfo: DesktopHostInfo, path: string, workspacePath: string) {
  const url = new URL(path, hostInfo.desktopHostUrl);
  url.searchParams.set("workspacePath", workspacePath);
  return url.toString();
}

function normalizeFlowChartRelativePath(relativePath: string) {
  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.json$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
}

function getFlowChartRelativePathLeaf(relativePath: string) {
  const segments = normalizeFlowChartRelativePath(relativePath).split("/");
  return segments[segments.length - 1] ?? "";
}

function buildEmptyFlowChartDocument(name: string, alias?: string | null): FlowChartFileDocument {
  return {
    formatVersion: "1.0",
    name,
    alias: alias ?? null,
    nodes: [],
    flowConnections: [],
    computeConnections: [],
  };
}

function cloneConnection(connection: FlowChartConnection): FlowChartConnection {
  return {
    sourceNodeId: connection.sourceNodeId,
    sourcePortId: connection.sourcePortId,
    targetNodeId: connection.targetNodeId,
    targetPortId: connection.targetPortId,
  };
}

function getDocumentBounds(nodes: FlowChartNodeInstance[]) {
  const [firstNode, ...restNodes] = nodes;
  if (!firstNode) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
  }

  return restNodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.layout.x),
      minY: Math.min(bounds.minY, node.layout.y),
      maxX: Math.max(bounds.maxX, node.layout.x),
      maxY: Math.max(bounds.maxY, node.layout.y),
    }),
    {
      minX: firstNode.layout.x,
      minY: firstNode.layout.y,
      maxX: firstNode.layout.x,
      maxY: firstNode.layout.y,
    },
  );
}

function sortNodesForAxis(
  nodes: FlowChartNodeInstance[],
  definitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>,
  axis: FlowChartDistributionAxis,
) {
  return [...nodes].sort((left, right) => {
    const leftRect = getFlowChartNodeRect(left, definitionsByType[left.nodeType]);
    const rightRect = getFlowChartNodeRect(right, definitionsByType[right.nodeType]);
    const leftPrimary = axis === "horizontal" ? leftRect.x + leftRect.width / 2 : leftRect.y + leftRect.height / 2;
    const rightPrimary = axis === "horizontal" ? rightRect.x + rightRect.width / 2 : rightRect.y + rightRect.height / 2;
    if (leftPrimary !== rightPrimary) {
      return leftPrimary - rightPrimary;
    }

    return left.nodeId - right.nodeId;
  });
}

function sanitizeSelection(selection: FlowChartSelection, document: FlowChartFileDocument | null): FlowChartSelection {
  if (!document) {
    return buildEmptySelection();
  }

  const nodeIdSet = new Set(document.nodes.map((node) => node.nodeId));
  const flowKeys = new Set(document.flowConnections.map((connection) => buildFlowChartConnectionKey(connection)));
  const computeKeys = new Set(document.computeConnections.map((connection) => buildFlowChartConnectionKey(connection)));

  const nextSelection: FlowChartSelection = {
    nodeIds: selection.nodeIds.filter((nodeId) => nodeIdSet.has(nodeId)),
    flowConnectionKeys: selection.flowConnectionKeys.filter((key) => flowKeys.has(key)),
    computeConnectionKeys: selection.computeConnectionKeys.filter((key) => computeKeys.has(key)),
    focus: selection.focus,
  };

  if (nextSelection.focus?.kind === "node" && !nodeIdSet.has(nextSelection.focus.nodeId)) {
    nextSelection.focus = null;
  }

  if (nextSelection.focus?.kind === "flow" && !flowKeys.has(nextSelection.focus.connectionKey)) {
    nextSelection.focus = null;
  }

  if (nextSelection.focus?.kind === "compute" && !computeKeys.has(nextSelection.focus.connectionKey)) {
    nextSelection.focus = null;
  }

  if (!nextSelection.focus) {
    if (nextSelection.nodeIds.length > 0) {
      nextSelection.focus = {
        kind: "node",
        nodeId: nextSelection.nodeIds[nextSelection.nodeIds.length - 1],
      };
    } else if (nextSelection.flowConnectionKeys.length > 0) {
      nextSelection.focus = {
        kind: "flow",
        connectionKey: nextSelection.flowConnectionKeys[nextSelection.flowConnectionKeys.length - 1],
      };
    } else if (nextSelection.computeConnectionKeys.length > 0) {
      nextSelection.focus = {
        kind: "compute",
        connectionKey: nextSelection.computeConnectionKeys[nextSelection.computeConnectionKeys.length - 1],
      };
    }
  }

  return nextSelection;
}

function buildNodeSelection(nodeIds: number[], mode: SelectionMode, previous: FlowChartSelection, focusNodeId?: number): FlowChartSelection {
  const uniqueNodeIds = uniqNumbers(nodeIds);
  if (mode === "replace") {
    return {
      nodeIds: uniqueNodeIds,
      flowConnectionKeys: [],
      computeConnectionKeys: [],
      focus: focusNodeId && uniqueNodeIds.includes(focusNodeId)
        ? { kind: "node", nodeId: focusNodeId }
        : uniqueNodeIds.length > 0
          ? { kind: "node", nodeId: uniqueNodeIds[uniqueNodeIds.length - 1] }
          : null,
    };
  }

  const nextNodeIds = new Set(previous.nodeIds);
  uniqueNodeIds.forEach((nodeId) => {
    if (mode === "toggle" && nextNodeIds.has(nodeId)) {
      nextNodeIds.delete(nodeId);
      return;
    }

    nextNodeIds.add(nodeId);
  });

  const normalizedNodeIds = Array.from(nextNodeIds);
  return {
    nodeIds: normalizedNodeIds,
    flowConnectionKeys: [],
    computeConnectionKeys: [],
    focus: focusNodeId && normalizedNodeIds.includes(focusNodeId)
      ? { kind: "node", nodeId: focusNodeId }
      : normalizedNodeIds.length > 0
        ? { kind: "node", nodeId: normalizedNodeIds[normalizedNodeIds.length - 1] }
        : null,
  };
}

function buildConnectionSelection(
  kind: FlowChartConnectionKind,
  connectionKeys: string[],
  mode: SelectionMode,
  previous: FlowChartSelection,
  focusKey?: string,
): FlowChartSelection {
  const uniqueKeys = uniqStrings(connectionKeys);
  if (mode === "replace") {
    return {
      nodeIds: [],
      flowConnectionKeys: kind === "flow" ? uniqueKeys : [],
      computeConnectionKeys: kind === "compute" ? uniqueKeys : [],
      focus: focusKey && uniqueKeys.includes(focusKey)
        ? { kind, connectionKey: focusKey }
        : uniqueKeys.length > 0
          ? { kind, connectionKey: uniqueKeys[uniqueKeys.length - 1] }
          : null,
    };
  }

  const currentKeys = new Set(kind === "flow" ? previous.flowConnectionKeys : previous.computeConnectionKeys);
  uniqueKeys.forEach((connectionKey) => {
    if (mode === "toggle" && currentKeys.has(connectionKey)) {
      currentKeys.delete(connectionKey);
      return;
    }

    currentKeys.add(connectionKey);
  });

  const normalizedKeys = Array.from(currentKeys);
  return {
    nodeIds: [],
    flowConnectionKeys: kind === "flow" ? normalizedKeys : [],
    computeConnectionKeys: kind === "compute" ? normalizedKeys : [],
    focus: focusKey && normalizedKeys.includes(focusKey)
      ? { kind, connectionKey: focusKey }
      : normalizedKeys.length > 0
        ? { kind, connectionKey: normalizedKeys[normalizedKeys.length - 1] }
        : null,
  };
}

function buildClipboardSnapshot(document: FlowChartFileDocument, selection: FlowChartSelection): FlowChartClipboardSnapshot | null {
  const selectedNodeIds = new Set(selection.nodeIds);
  const selectedFlowKeys = new Set(selection.flowConnectionKeys);
  const selectedComputeKeys = new Set(selection.computeConnectionKeys);

  if (selectedNodeIds.size === 0) {
    document.flowConnections.forEach((connection) => {
      const key = buildFlowChartConnectionKey(connection);
      if (selectedFlowKeys.has(key)) {
        selectedNodeIds.add(connection.sourceNodeId);
        selectedNodeIds.add(connection.targetNodeId);
      }
    });

    document.computeConnections.forEach((connection) => {
      const key = buildFlowChartConnectionKey(connection);
      if (selectedComputeKeys.has(key)) {
        selectedNodeIds.add(connection.sourceNodeId);
        selectedNodeIds.add(connection.targetNodeId);
      }
    });
  }

  const nodes = document.nodes
    .filter((node) => selectedNodeIds.has(node.nodeId))
    .map((node) => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      layout: {
        x: node.layout.x,
        y: node.layout.y,
      },
      propertyValues: node.propertyValues.map((entry) => ({
        propertyId: entry.propertyId,
        value: structuredClone(entry.value),
      })),
    }));

  if (nodes.length === 0) {
    return null;
  }

  const includedNodeIds = new Set(nodes.map((node) => node.nodeId));
  const flowConnections = document.flowConnections
    .filter((connection) => {
      const key = buildFlowChartConnectionKey(connection);
      return selectedFlowKeys.has(key) || (includedNodeIds.has(connection.sourceNodeId) && includedNodeIds.has(connection.targetNodeId));
    })
    .map(cloneConnection);
  const computeConnections = document.computeConnections
    .filter((connection) => {
      const key = buildFlowChartConnectionKey(connection);
      return selectedComputeKeys.has(key) || (includedNodeIds.has(connection.sourceNodeId) && includedNodeIds.has(connection.targetNodeId));
    })
    .map(cloneConnection);

  return {
    nodes,
    flowConnections,
    computeConnections,
    bounds: getDocumentBounds(nodes),
  };
}

export function useFlowChartEditor({ hostInfo, workspacePath, onToast }: UseFlowChartEditorArgs) {
  const [catalog, setCatalog] = useState<FlowChartCatalogResponse | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [activeFlowChartPath, setActiveFlowChartPath] = useState<string | null>(null);
  const [activeFlowChartReloadKey, setActiveFlowChartReloadKey] = useState(0);
  const [activeFlowChartState, setActiveFlowChartState] = useState<ActiveFlowChartState>({
    status: "idle",
    dirty: false,
  });
  const [selection, setSelection] = useState<FlowChartSelection>(buildEmptySelection);
  const [pendingConnection, setPendingConnection] = useState<PendingFlowChartConnection | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nodeDefinitionsByPath, setNodeDefinitionsByPath] = useState<Record<string, FlowChartNodeDefinitionResponse | null>>({});
  const pendingNodeDefinitionLoadsRef = useRef<Set<string>>(new Set());
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const clipboardStateRef = useRef<ClipboardState>({
    snapshot: null,
    pasteSequence: 0,
  });

  const activeSummary = activeFlowChartState.status === "ready" ? activeFlowChartState.response : null;
  const activeDocument = activeFlowChartState.status === "ready" ? activeFlowChartState.document : null;

  const resolvedDefinitionsByType = useMemo<Record<string, FlowChartNodeDefinitionDocument | undefined>>(() => {
    const resolvedEntries = new Map<string, FlowChartNodeDefinitionDocument | undefined>();

    catalog?.nodeDefinitions.forEach((summary) => {
      resolvedEntries.set(summary.relativePath, nodeDefinitionsByPath[summary.relativePath]?.document ?? undefined);
    });

    activeDocument?.nodes.forEach((node) => {
      if (!resolvedEntries.has(node.nodeType)) {
        resolvedEntries.set(node.nodeType, nodeDefinitionsByPath[node.nodeType]?.document ?? undefined);
      }
    });

    return Object.fromEntries(resolvedEntries);
  }, [activeDocument, catalog, nodeDefinitionsByPath]);

  const validationIssues = useMemo(
    () => (activeDocument ? validateFlowChartDocument(activeDocument, resolvedDefinitionsByType) : []),
    [activeDocument, resolvedDefinitionsByType],
  );

  const selectedNodes = useMemo(() => {
    if (!activeDocument) {
      return [];
    }

    const selectedNodeIdSet = new Set(selection.nodeIds);
    return activeDocument.nodes.filter((node) => selectedNodeIdSet.has(node.nodeId));
  }, [activeDocument, selection.nodeIds]);

  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedConnectionCount = selection.flowConnectionKeys.length + selection.computeConnectionKeys.length;

  const selectedConnectionItem = useMemo(() => {
    if (!activeDocument || selection.nodeIds.length > 0 || selectedConnectionCount !== 1) {
      return null;
    }

    if (selection.flowConnectionKeys.length === 1) {
      const connection = activeDocument.flowConnections.find(
        (candidate) => buildFlowChartConnectionKey(candidate) === selection.flowConnectionKeys[0],
      );
      return connection ? { kind: "flow" as const, connection } : null;
    }

    const connection = activeDocument.computeConnections.find(
      (candidate) => buildFlowChartConnectionKey(candidate) === selection.computeConnectionKeys[0],
    );
    return connection ? { kind: "compute" as const, connection } : null;
  }, [activeDocument, selectedConnectionCount, selection.computeConnectionKeys, selection.flowConnectionKeys, selection.nodeIds.length]);

  const hasSelection = selection.nodeIds.length > 0 || selectedConnectionCount > 0;
  const canSaveActiveFlowChart = activeFlowChartState.status === "ready" && saveState !== "saving";
  const canPasteClipboard = clipboardStateRef.current.snapshot !== null && activeFlowChartState.status === "ready";

  const applyCatalog = useCallback((nextCatalog: FlowChartCatalogResponse) => {
    setCatalog(nextCatalog);
    setCatalogStatus("ready");
    setCatalogError(null);
  }, []);

  const closeActiveFlowChart = useCallback(() => {
    setActiveFlowChartPath(null);
    setActiveFlowChartState({ status: "idle", dirty: false });
    setSelection(buildEmptySelection());
    setPendingConnection(null);
    setSaveState("idle");
    setSaveError(null);
  }, []);

  const loadFlowChartFile = useCallback(
    async (relativePath: string) => {
      if (!hostInfo || !workspacePath) {
        throw new Error("当前未连接到流程图宿主。\n请先打开工作区并确认 DesktopHost 已就绪。");
      }

      return fetchJson<FlowChartFileResponse>(
        buildApiUrl(hostInfo, `/api/workspace/flowcharts/files/${encodeFlowChartRelativePath(relativePath)}`, workspacePath),
      );
    },
    [hostInfo, workspacePath],
  );

  const mutateFlowChartCatalog = useCallback(
    async (path: string, payload: Record<string, unknown>) => {
      if (!hostInfo || !workspacePath) {
        throw new Error("当前未连接到流程图宿主。\n请先打开工作区并确认 DesktopHost 已就绪。");
      }

      const response = await fetchJson<FlowChartCatalogResponse>(`${hostInfo.desktopHostUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspacePath,
          ...payload,
        }),
      });

      applyCatalog(response);
      return response;
    },
    [applyCatalog, hostInfo, workspacePath],
  );

  const updateActiveDocument = useCallback(
    (updater: (document: FlowChartFileDocument, response: FlowChartFileResponse) => void) => {
      setActiveFlowChartState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        const nextDocument = cloneFlowChartFileDocument(current.document);
        const nextResponse: FlowChartFileResponse = {
          ...current.response,
          document: nextDocument,
        };
        updater(nextDocument, nextResponse);

        return {
          status: "ready",
          dirty: true,
          response: nextResponse,
          document: nextDocument,
        };
      });
      setSaveState("idle");
      setSaveError(null);
    },
    [],
  );

  const ensureNodeDefinition = useCallback(
    async (relativePath: string) => {
      if (!hostInfo || !workspacePath || nodeDefinitionsByPath[relativePath] !== undefined || pendingNodeDefinitionLoadsRef.current.has(relativePath)) {
        return;
      }

      pendingNodeDefinitionLoadsRef.current.add(relativePath);
      try {
        const response = await fetchJson<FlowChartNodeDefinitionResponse>(
          buildApiUrl(hostInfo, `/api/workspace/flowcharts/nodes/${encodeFlowChartRelativePath(relativePath)}`, workspacePath),
        );
        setNodeDefinitionsByPath((current) => ({
          ...current,
          [relativePath]: response,
        }));
      } catch (error) {
        setNodeDefinitionsByPath((current) => ({
          ...current,
          [relativePath]: null,
        }));
        onToast({
          title: "节点定义加载失败",
          summary: relativePath,
          detail: error instanceof Error ? error.message : "未能读取节点定义。",
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
      } finally {
        pendingNodeDefinitionLoadsRef.current.delete(relativePath);
      }
    },
    [hostInfo, nodeDefinitionsByPath, onToast, workspacePath],
  );

  useEffect(() => {
    setSelection(buildEmptySelection());
    setPendingConnection(null);
    setActiveFlowChartPath(null);
    setActiveFlowChartReloadKey(0);
    setActiveFlowChartState({ status: "idle", dirty: false });
    setSaveState("idle");
    setSaveError(null);
    setNodeDefinitionsByPath({});
    pendingNodeDefinitionLoadsRef.current.clear();
    clipboardStateRef.current = {
      snapshot: null,
      pasteSequence: 0,
    };
    setClipboardVersion((current) => current + 1);
  }, [workspacePath]);

  useEffect(() => {
    if (!hostInfo || !workspacePath) {
      setCatalog(null);
      setCatalogStatus("idle");
      setCatalogError(null);
      return;
    }

    let cancelled = false;
    setCatalogStatus("loading");
    setCatalogError(null);

    void fetchJson<FlowChartCatalogResponse>(buildApiUrl(hostInfo, "/api/workspace/flowcharts/navigation", workspacePath))
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCatalog(response);
        setCatalogStatus("ready");
        setCatalogError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setCatalog(null);
        setCatalogStatus("error");
        setCatalogError(error instanceof Error ? error.message : "未能读取流程图导航。");
      });

    return () => {
      cancelled = true;
    };
  }, [catalogReloadKey, hostInfo, workspacePath]);

  useEffect(() => {
    if (!hostInfo || !workspacePath || !activeFlowChartPath) {
      setActiveFlowChartState({ status: "idle", dirty: false });
      setSelection(buildEmptySelection());
      setPendingConnection(null);
      setSaveState("idle");
      setSaveError(null);
      return;
    }

    let cancelled = false;
    setActiveFlowChartState({ status: "loading", dirty: false });
    setSelection(buildEmptySelection());
    setPendingConnection(null);
    setSaveState("idle");
    setSaveError(null);

    void fetchJson<FlowChartFileResponse>(
      buildApiUrl(hostInfo, `/api/workspace/flowcharts/files/${encodeFlowChartRelativePath(activeFlowChartPath)}`, workspacePath),
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (!response.document) {
          setActiveFlowChartState({
            status: "error",
            dirty: false,
            error: "流程图文件缺少 document 内容。",
          });
          return;
        }

        setActiveFlowChartState({
          status: "ready",
          dirty: false,
          response,
          document: cloneFlowChartFileDocument(response.document),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setActiveFlowChartState({
          status: "error",
          dirty: false,
          error: error instanceof Error ? error.message : "未能读取流程图文件。",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeFlowChartPath, activeFlowChartReloadKey, hostInfo, workspacePath]);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }

    const missingTypes = Array.from(new Set(activeDocument.nodes.map((node) => node.nodeType))).filter(
      (nodeType) => nodeDefinitionsByPath[nodeType] === undefined,
    );

    if (missingTypes.length === 0) {
      return;
    }

    missingTypes.forEach((nodeType) => {
      void ensureNodeDefinition(nodeType);
    });
  }, [activeDocument, ensureNodeDefinition, nodeDefinitionsByPath]);

  useEffect(() => {
    setSelection((current) => sanitizeSelection(current, activeDocument));
  }, [activeDocument]);

  useEffect(() => {
    if (!activeDocument || !pendingConnection) {
      return;
    }

    const sourceNode = activeDocument.nodes.find((node) => node.nodeId === pendingConnection.sourceNodeId);
    if (!sourceNode) {
      setPendingConnection(null);
      return;
    }

    const sourceDefinition = resolvedDefinitionsByType[sourceNode.nodeType];
    const sourcePort = getFlowChartPortDescriptor(sourceDefinition, pendingConnection.kind, pendingConnection.sourcePortId);
    if (!sourcePort || sourcePort.direction !== "output") {
      setPendingConnection(null);
    }
  }, [activeDocument, pendingConnection, resolvedDefinitionsByType]);

  const selectFlowChart = useCallback((relativePath: string) => {
    setActiveFlowChartPath((current) => {
      if (current === relativePath) {
        return current;
      }

      return relativePath;
    });
  }, []);

  const reloadCatalog = useCallback(() => {
    setCatalogReloadKey((current) => current + 1);
  }, []);

  const reloadActiveFlowChart = useCallback(() => {
    if (!activeFlowChartPath) {
      return;
    }

    setActiveFlowChartReloadKey((current) => current + 1);
  }, [activeFlowChartPath]);

  const createFlowChartDirectory = useCallback(
    async (scope: FlowChartAssetScope, relativePath: string) => {
      const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
      if (!normalizedRelativePath) {
        onToast({
          title: "目录路径无效",
          detail: "请输入有效的目录相对路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      try {
        await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/directories/create", {
          scope,
          relativePath: normalizedRelativePath,
        });
        onToast({
          title: "目录已创建",
          summary: normalizedRelativePath,
          source: "workspace",
          variant: "success",
          canOpenDetail: false,
          durationMs: 2200,
        });
        return true;
      } catch (error) {
        onToast({
          title: "目录创建失败",
          summary: normalizedRelativePath,
          detail: error instanceof Error ? error.message : "未能创建流程图目录。",
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [mutateFlowChartCatalog, onToast],
  );

  const renameFlowChartDirectory = useCallback(
    async (scope: FlowChartAssetScope, relativePath: string, newRelativePath: string) => {
      const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
      const normalizedNewRelativePath = normalizeFlowChartRelativePath(newRelativePath);
      if (!normalizedRelativePath || !normalizedNewRelativePath) {
        onToast({
          title: "目录路径无效",
          detail: "请输入有效的目录路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      try {
        await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/directories/rename", {
          scope,
          relativePath: normalizedRelativePath,
          newRelativePath: normalizedNewRelativePath,
        });

        if (
          scope === "files"
          && activeFlowChartPath
          && (activeFlowChartPath === normalizedRelativePath || activeFlowChartPath.startsWith(`${normalizedRelativePath}/`))
        ) {
          const suffix = activeFlowChartPath === normalizedRelativePath
            ? ""
            : activeFlowChartPath.slice(normalizedRelativePath.length + 1);
          const nextActivePath = suffix ? `${normalizedNewRelativePath}/${suffix}` : normalizedNewRelativePath;
          setActiveFlowChartPath(nextActivePath);
        }

        onToast({
          title: "目录已重命名",
          summary: `${normalizedRelativePath} -> ${normalizedNewRelativePath}`,
          source: "workspace",
          variant: "success",
          canOpenDetail: false,
          durationMs: 2200,
        });
        return true;
      } catch (error) {
        onToast({
          title: "目录重命名失败",
          summary: normalizedRelativePath,
          detail: error instanceof Error ? error.message : "未能重命名流程图目录。",
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [activeFlowChartPath, mutateFlowChartCatalog, onToast],
  );

  const deleteFlowChartDirectory = useCallback(
    async (scope: FlowChartAssetScope, relativePath: string) => {
      const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
      if (!normalizedRelativePath) {
        onToast({
          title: "目录路径无效",
          detail: "请输入有效的目录路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      try {
        await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/directories/delete", {
          scope,
          relativePath: normalizedRelativePath,
        });

        if (
          scope === "files"
          && activeFlowChartPath
          && (activeFlowChartPath === normalizedRelativePath || activeFlowChartPath.startsWith(`${normalizedRelativePath}/`))
        ) {
          closeActiveFlowChart();
        }

        onToast({
          title: "目录已删除",
          summary: normalizedRelativePath,
          source: "workspace",
          variant: "success",
          canOpenDetail: false,
          durationMs: 2200,
        });
        return true;
      } catch (error) {
        onToast({
          title: "目录删除失败",
          summary: normalizedRelativePath,
          detail: error instanceof Error ? error.message : "未能删除流程图目录。",
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [activeFlowChartPath, closeActiveFlowChart, mutateFlowChartCatalog, onToast],
  );

  const deleteFlowChartFile = useCallback(
    async (scope: FlowChartAssetScope, relativePath: string) => {
      const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
      if (!normalizedRelativePath) {
        onToast({
          title: "文件路径无效",
          detail: "请输入有效的文件相对路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      try {
        await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/files/delete", {
          scope,
          relativePath: normalizedRelativePath,
        });

        if (scope === "files" && activeFlowChartPath === normalizedRelativePath) {
          closeActiveFlowChart();
        }

        onToast({
          title: scope === "files" ? "流程图已删除" : "节点定义已删除",
          summary: normalizedRelativePath,
          source: "workspace",
          variant: "success",
          canOpenDetail: false,
          durationMs: 2200,
        });
        return true;
      } catch (error) {
        onToast({
          title: scope === "files" ? "流程图删除失败" : "节点定义删除失败",
          summary: normalizedRelativePath,
          detail: error instanceof Error ? error.message : "未能删除流程图资产文件。",
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [activeFlowChartPath, closeActiveFlowChart, mutateFlowChartCatalog, onToast],
  );

  const clearSelection = useCallback(() => {
    setSelection(buildEmptySelection());
  }, []);

  const selectNode = useCallback((nodeId: number, mode: SelectionMode = "replace") => {
    setSelection((current) => buildNodeSelection([nodeId], mode, current, nodeId));
  }, []);

  const selectNodes = useCallback((nodeIds: number[], mode: SelectionMode = "replace", focusNodeId?: number) => {
    setSelection((current) => buildNodeSelection(nodeIds, mode, current, focusNodeId));
  }, []);

  const selectConnection = useCallback((kind: FlowChartConnectionKind, connectionKey: string, mode: SelectionMode = "replace") => {
    setSelection((current) => buildConnectionSelection(kind, [connectionKey], mode, current, connectionKey));
  }, []);

  const moveNode = useCallback(
    (nodeId: number, position: { x: number; y: number }) => {
      updateActiveDocument((document) => {
        const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
        if (!node) {
          return;
        }

        node.layout.x = Math.max(0, Math.round(position.x));
        node.layout.y = Math.max(0, Math.round(position.y));
      });
    },
    [updateActiveDocument],
  );

  const moveSelectedNodes = useCallback(
    (nodeIds: number[], delta: { x: number; y: number }) => {
      if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return;
      }

      const normalizedNodeIds = new Set(nodeIds);
      updateActiveDocument((document) => {
        document.nodes.forEach((node) => {
          if (!normalizedNodeIds.has(node.nodeId)) {
            return;
          }

          node.layout.x = Math.max(0, Math.round(node.layout.x + delta.x));
          node.layout.y = Math.max(0, Math.round(node.layout.y + delta.y));
        });
      });
    },
    [updateActiveDocument],
  );

  const addNode = useCallback(
    async (nodeType: string) => {
      if (!activeDocument) {
        return;
      }

      await ensureNodeDefinition(nodeType);

      const nextNodeId = activeDocument.nodes.reduce((maxNodeId, node) => Math.max(maxNodeId, node.nodeId), 0) + 1;
      const selectionBounds = selectedNodes.length > 0 ? getDocumentBounds(selectedNodes) : null;
      const nextPosition = selectionBounds
        ? { x: selectionBounds.maxX + 104, y: selectionBounds.minY + 24 }
        : { x: 120 + activeDocument.nodes.length * 18, y: 96 + activeDocument.nodes.length * 18 };

      updateActiveDocument((document) => {
        document.nodes.push({
          nodeId: nextNodeId,
          nodeType,
          layout: nextPosition,
          propertyValues: [],
        });
      });

      setSelection(buildNodeSelection([nextNodeId], "replace", buildEmptySelection(), nextNodeId));
    },
    [activeDocument, ensureNodeDefinition, selectedNodes, updateActiveDocument],
  );

  const createFlowChart = useCallback(
    async (input: { relativePath: string; name?: string; alias?: string | null }) => {
      if (!hostInfo || !workspacePath) {
        return false;
      }

      const normalizedRelativePath = normalizeFlowChartRelativePath(input.relativePath);
      if (!normalizedRelativePath) {
        onToast({
          title: "流程图路径无效",
          detail: "请输入有效的相对路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      if (catalog?.files.some((file) => file.relativePath === normalizedRelativePath)) {
        onToast({
          title: "流程图已存在",
          summary: normalizedRelativePath,
          detail: "请修改相对路径后重试。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      const fallbackName = getFlowChartRelativePathLeaf(normalizedRelativePath);
      const name = input.name?.trim() || fallbackName;
      if (!name) {
        onToast({
          title: "流程图名称不能为空",
          detail: "请输入名称，或提供可推导名称的相对路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      const alias = input.alias?.trim() ? input.alias.trim() : null;
      const document = buildEmptyFlowChartDocument(name, alias);

      setSaveState("saving");
      setSaveError(null);

      try {
        const response = await fetchJson<FlowChartFileResponse>(`${hostInfo.desktopHostUrl}/api/workspace/flowcharts/files/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            relativePath: normalizedRelativePath,
            document,
          }),
        });

        setCatalog((current) => {
          if (!current) {
            return current;
          }

          const nextFiles = [
            ...current.files.filter((file) => file.relativePath !== response.relativePath),
            {
              kind: response.kind,
              relativePath: response.relativePath,
              filePath: response.filePath,
              name: response.name,
              alias: response.alias ?? null,
            },
          ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));

          return {
            ...current,
            files: nextFiles,
          };
        });

        setActiveFlowChartPath(normalizedRelativePath);
        setActiveFlowChartState({
          status: "ready",
          dirty: false,
          response,
          document: cloneFlowChartFileDocument(response.document ?? document),
        });
        setSelection(buildEmptySelection());
        setPendingConnection(null);
        reloadCatalog();
        setSaveState("saved");
        setSaveError(null);
        onToast({
          title: "流程图已创建",
          summary: normalizedRelativePath,
          source: "workspace",
          variant: "success",
          canOpenDetail: false,
          durationMs: 2400,
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "流程图创建失败。";
        setSaveState("error");
        setSaveError(message);
        onToast({
          title: "流程图创建失败",
          summary: normalizedRelativePath,
          detail: message,
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [catalog?.files, hostInfo, onToast, reloadCatalog, workspacePath],
  );

  const saveFlowChartMetadata = useCallback(
    async (input: { previousRelativePath?: string | null; relativePath: string; name: string; alias?: string | null }) => {
      if (!hostInfo || !workspacePath) {
        return false;
      }

      const normalizedRelativePath = normalizeFlowChartRelativePath(input.relativePath);
      const normalizedPreviousRelativePath = normalizeFlowChartRelativePath(input.previousRelativePath ?? input.relativePath);
      const trimmedName = input.name.trim();
      const alias = input.alias?.trim() ? input.alias.trim() : null;

      if (!normalizedRelativePath || !normalizedPreviousRelativePath) {
        onToast({
          title: "流程图路径无效",
          detail: "请输入有效的流程图相对路径。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      if (!trimmedName) {
        onToast({
          title: "流程图名称不能为空",
          detail: "请输入流程图名称。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      if (
        normalizedRelativePath !== normalizedPreviousRelativePath
        && catalog?.files.some((file) => file.relativePath === normalizedRelativePath)
      ) {
        onToast({
          title: "流程图已存在",
          summary: normalizedRelativePath,
          detail: "请修改相对路径后重试。",
          source: "workspace",
          variant: "error",
          canOpenDetail: false,
        });
        return false;
      }

      setSaveState("saving");
      setSaveError(null);

      try {
        const sourceResponse = activeFlowChartPath === normalizedPreviousRelativePath && activeFlowChartState.status === "ready"
          ? {
              ...activeFlowChartState.response,
              document: cloneFlowChartFileDocument(activeFlowChartState.document),
            }
          : await loadFlowChartFile(normalizedPreviousRelativePath);
        const document = cloneFlowChartFileDocument(
          sourceResponse.document ?? buildEmptyFlowChartDocument(trimmedName, alias),
        );

        document.name = trimmedName;
        document.alias = alias;

        const response = await fetchJson<FlowChartFileResponse>(`${hostInfo.desktopHostUrl}/api/workspace/flowcharts/files/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            relativePath: normalizedRelativePath,
            document,
          }),
        });

        let removedPreviousPath = true;
        if (normalizedRelativePath !== normalizedPreviousRelativePath) {
          try {
            await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/files/delete", {
              scope: "files",
              relativePath: normalizedPreviousRelativePath,
            });
          } catch {
            removedPreviousPath = false;
          }
        } else {
          reloadCatalog();
        }

        if (activeFlowChartPath === normalizedPreviousRelativePath) {
          setActiveFlowChartPath(normalizedRelativePath);
          setActiveFlowChartState({
            status: "ready",
            dirty: false,
            response,
            document: cloneFlowChartFileDocument(response.document ?? document),
          });
        }

        setSaveState("saved");
        setSaveError(null);
        onToast({
          title: removedPreviousPath ? "流程图元信息已更新" : "流程图已另存，旧文件删除失败",
          summary: normalizedRelativePath,
          detail: removedPreviousPath ? undefined : `旧路径 ${normalizedPreviousRelativePath} 仍然保留，请手动检查。`,
          source: "save",
          variant: removedPreviousPath ? "success" : "error",
          canOpenDetail: !removedPreviousPath,
          durationMs: removedPreviousPath ? 2400 : undefined,
        });
        return removedPreviousPath;
      } catch (error) {
        const message = error instanceof Error ? error.message : "流程图元信息保存失败。";
        setSaveState("error");
        setSaveError(message);
        onToast({
          title: "流程图元信息保存失败",
          summary: normalizedPreviousRelativePath,
          detail: message,
          source: "save",
          variant: "error",
          canOpenDetail: true,
        });
        return false;
      }
    },
    [
      activeFlowChartPath,
      activeFlowChartState,
      catalog?.files,
      hostInfo,
      loadFlowChartFile,
      mutateFlowChartCatalog,
      onToast,
      reloadCatalog,
      workspacePath,
    ],
  );

  const updateActiveFlowChartMeta = useCallback(
    (patch: { name?: string; alias?: string | null }) => {
      updateActiveDocument((document, response) => {
        if (patch.name !== undefined) {
          document.name = patch.name;
          response.name = patch.name;
        }

        if (patch.alias !== undefined) {
          document.alias = patch.alias;
          response.alias = patch.alias;
        }
      });
    },
    [updateActiveDocument],
  );

  const alignSelectedNodes = useCallback(
    (mode: FlowChartAlignMode) => {
      if (selectedNodes.length < 2) {
        return false;
      }

      const selectedNodeIds = new Set(selectedNodes.map((node) => node.nodeId));
      const selectedRects = selectedNodes.map((node) => ({
        nodeId: node.nodeId,
        rect: getFlowChartNodeRect(node, resolvedDefinitionsByType[node.nodeType]),
      }));

      const horizontalAnchor = mode === "left"
        ? Math.min(...selectedRects.map((entry) => entry.rect.x))
        : mode === "center"
          ? selectedRects.reduce((sum, entry) => sum + entry.rect.x + entry.rect.width / 2, 0) / selectedRects.length
          : mode === "right"
            ? Math.max(...selectedRects.map((entry) => entry.rect.x + entry.rect.width))
            : null;
      const verticalAnchor = mode === "top"
        ? Math.min(...selectedRects.map((entry) => entry.rect.y))
        : mode === "middle"
          ? selectedRects.reduce((sum, entry) => sum + entry.rect.y + entry.rect.height / 2, 0) / selectedRects.length
          : mode === "bottom"
            ? Math.max(...selectedRects.map((entry) => entry.rect.y + entry.rect.height))
            : null;

      updateActiveDocument((document) => {
        document.nodes.forEach((node) => {
          if (!selectedNodeIds.has(node.nodeId)) {
            return;
          }

          const rect = getFlowChartNodeRect(node, resolvedDefinitionsByType[node.nodeType]);
          if (horizontalAnchor !== null) {
            node.layout.x = Math.max(
              0,
              Math.round(mode === "left" ? horizontalAnchor : mode === "center" ? horizontalAnchor - rect.width / 2 : horizontalAnchor - rect.width),
            );
          }

          if (verticalAnchor !== null) {
            node.layout.y = Math.max(
              0,
              Math.round(mode === "top" ? verticalAnchor : mode === "middle" ? verticalAnchor - rect.height / 2 : verticalAnchor - rect.height),
            );
          }
        });
      });

      return true;
    },
    [resolvedDefinitionsByType, selectedNodes, updateActiveDocument],
  );

  const distributeSelectedNodes = useCallback(
    (axis: FlowChartDistributionAxis) => {
      if (selectedNodes.length < 3) {
        return false;
      }

      const orderedNodes = sortNodesForAxis(selectedNodes, resolvedDefinitionsByType, axis);
      const firstNode = orderedNodes[0];
      const lastNode = orderedNodes[orderedNodes.length - 1];
      if (!firstNode || !lastNode) {
        return false;
      }

      const firstRect = getFlowChartNodeRect(firstNode, resolvedDefinitionsByType[firstNode.nodeType]);
      const lastRect = getFlowChartNodeRect(lastNode, resolvedDefinitionsByType[lastNode.nodeType]);
      const start = axis === "horizontal" ? firstRect.x + firstRect.width / 2 : firstRect.y + firstRect.height / 2;
      const end = axis === "horizontal" ? lastRect.x + lastRect.width / 2 : lastRect.y + lastRect.height / 2;
      const step = (end - start) / (orderedNodes.length - 1);
      const positionByNodeId = new Map<number, number>();

      orderedNodes.forEach((node, index) => {
        if (index === 0 || index === orderedNodes.length - 1) {
          return;
        }

        positionByNodeId.set(node.nodeId, start + step * index);
      });

      updateActiveDocument((document) => {
        document.nodes.forEach((node) => {
          const targetCenter = positionByNodeId.get(node.nodeId);
          if (targetCenter === undefined) {
            return;
          }

          const rect = getFlowChartNodeRect(node, resolvedDefinitionsByType[node.nodeType]);
          if (axis === "horizontal") {
            node.layout.x = Math.max(0, Math.round(targetCenter - rect.width / 2));
            return;
          }

          node.layout.y = Math.max(0, Math.round(targetCenter - rect.height / 2));
        });
      });

      return true;
    },
    [resolvedDefinitionsByType, selectedNodes, updateActiveDocument],
  );

  const autoLayoutNodes = useCallback(() => {
    if (!activeDocument) {
      return false;
    }

    const layoutNodes = selectedNodes.length >= 2 ? selectedNodes : activeDocument.nodes;
    if (layoutNodes.length < 2) {
      return false;
    }

    const layoutNodeIds = new Set(layoutNodes.map((node) => node.nodeId));
    const layoutBounds = getDocumentBounds(layoutNodes);
    const outgoing = new Map<number, Set<number>>();
    const indegree = new Map<number, number>();
    const nodeOrder = [...layoutNodes].sort((left, right) => {
      if (left.layout.x !== right.layout.x) {
        return left.layout.x - right.layout.x;
      }

      if (left.layout.y !== right.layout.y) {
        return left.layout.y - right.layout.y;
      }

      return left.nodeId - right.nodeId;
    });

    nodeOrder.forEach((node) => {
      outgoing.set(node.nodeId, new Set());
      indegree.set(node.nodeId, 0);
    });

    [...activeDocument.flowConnections, ...activeDocument.computeConnections].forEach((connection) => {
      if (!layoutNodeIds.has(connection.sourceNodeId) || !layoutNodeIds.has(connection.targetNodeId)) {
        return;
      }

      const targets = outgoing.get(connection.sourceNodeId);
      if (!targets || targets.has(connection.targetNodeId)) {
        return;
      }

      targets.add(connection.targetNodeId);
      indegree.set(connection.targetNodeId, (indegree.get(connection.targetNodeId) ?? 0) + 1);
    });

    const queue = nodeOrder.filter((node) => (indegree.get(node.nodeId) ?? 0) === 0).map((node) => node.nodeId);
    const processed = new Set<number>();
    const levelByNodeId = new Map<number, number>();

    while (processed.size < nodeOrder.length) {
      if (queue.length === 0) {
        const fallbackNode = nodeOrder.find((node) => !processed.has(node.nodeId));
        if (!fallbackNode) {
          break;
        }

        queue.push(fallbackNode.nodeId);
      }

      const nodeId = queue.shift();
      if (nodeId === undefined || processed.has(nodeId)) {
        continue;
      }

      processed.add(nodeId);
      const currentLevel = levelByNodeId.get(nodeId) ?? 0;
      Array.from(outgoing.get(nodeId) ?? []).forEach((targetNodeId) => {
        levelByNodeId.set(targetNodeId, Math.max(levelByNodeId.get(targetNodeId) ?? 0, currentLevel + 1));
        indegree.set(targetNodeId, Math.max(0, (indegree.get(targetNodeId) ?? 0) - 1));
        if ((indegree.get(targetNodeId) ?? 0) === 0) {
          queue.push(targetNodeId);
        }
      });
    }

    const lanes = new Map<number, FlowChartNodeInstance[]>();
    nodeOrder.forEach((node) => {
      const level = levelByNodeId.get(node.nodeId) ?? 0;
      const lane = lanes.get(level);
      if (lane) {
        lane.push(node);
        return;
      }

      lanes.set(level, [node]);
    });

    const nextPositions = new Map<number, { x: number; y: number }>();
    Array.from(lanes.entries())
      .sort(([leftLevel], [rightLevel]) => leftLevel - rightLevel)
      .forEach(([level, nodes]) => {
        let cursorY = layoutBounds.minY;
        nodes
          .sort((left, right) => {
            if (left.layout.y !== right.layout.y) {
              return left.layout.y - right.layout.y;
            }

            return left.nodeId - right.nodeId;
          })
          .forEach((node) => {
            const rect = getFlowChartNodeRect(node, resolvedDefinitionsByType[node.nodeType]);
            nextPositions.set(node.nodeId, {
              x: Math.max(0, Math.round(layoutBounds.minX + level * (flowChartNodeWidth + 120))),
              y: Math.max(0, Math.round(cursorY)),
            });
            cursorY += rect.height + 72;
          });
      });

    updateActiveDocument((document) => {
      document.nodes.forEach((node) => {
        const nextPosition = nextPositions.get(node.nodeId);
        if (!nextPosition) {
          return;
        }

        node.layout.x = nextPosition.x;
        node.layout.y = nextPosition.y;
      });
    });

    return true;
  }, [activeDocument, resolvedDefinitionsByType, selectedNodes, updateActiveDocument]);

  const updateNodePropertyValue = useCallback(
    (nodeId: number, propertyId: number, value: unknown) => {
      updateActiveDocument((document) => {
        const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
        if (!node) {
          return;
        }

        upsertNodePropertyValue(node, propertyId, value);
      });
    },
    [updateActiveDocument],
  );

  const resetNodePropertyValue = useCallback(
    (nodeId: number, propertyId: number) => {
      updateActiveDocument((document) => {
        const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
        if (!node) {
          return;
        }

        removeNodePropertyValue(node, propertyId);
      });
    },
    [updateActiveDocument],
  );

  const deleteSelection = useCallback(() => {
    if (!activeDocument || !hasSelection) {
      return;
    }

    const selectedNodeIds = new Set(selection.nodeIds);
    const selectedFlowKeys = new Set(selection.flowConnectionKeys);
    const selectedComputeKeys = new Set(selection.computeConnectionKeys);

    updateActiveDocument((document) => {
      document.nodes = document.nodes.filter((node) => !selectedNodeIds.has(node.nodeId));
      document.flowConnections = document.flowConnections.filter((connection) => {
        const key = buildFlowChartConnectionKey(connection);
        return !selectedNodeIds.has(connection.sourceNodeId) && !selectedNodeIds.has(connection.targetNodeId) && !selectedFlowKeys.has(key);
      });
      document.computeConnections = document.computeConnections.filter((connection) => {
        const key = buildFlowChartConnectionKey(connection);
        return !selectedNodeIds.has(connection.sourceNodeId) && !selectedNodeIds.has(connection.targetNodeId) && !selectedComputeKeys.has(key);
      });
    });

    setSelection(buildEmptySelection());
    setPendingConnection(null);
  }, [activeDocument, hasSelection, selection, updateActiveDocument]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return;
    }

    setSelection(buildNodeSelection([selectedNode.nodeId], "replace", buildEmptySelection(), selectedNode.nodeId));
    updateActiveDocument((document) => {
      document.nodes = document.nodes.filter((node) => node.nodeId !== selectedNode.nodeId);
      document.flowConnections = document.flowConnections.filter(
        (connection) => connection.sourceNodeId !== selectedNode.nodeId && connection.targetNodeId !== selectedNode.nodeId,
      );
      document.computeConnections = document.computeConnections.filter(
        (connection) => connection.sourceNodeId !== selectedNode.nodeId && connection.targetNodeId !== selectedNode.nodeId,
      );
    });
    setSelection(buildEmptySelection());
  }, [selectedNode, updateActiveDocument]);

  const deleteSelectedConnection = useCallback(() => {
    if (!selectedConnectionItem) {
      return;
    }

    const connectionKey = buildFlowChartConnectionKey(selectedConnectionItem.connection);
    updateActiveDocument((document) => {
      if (selectedConnectionItem.kind === "flow") {
        document.flowConnections = document.flowConnections.filter(
          (connection) => buildFlowChartConnectionKey(connection) !== connectionKey,
        );
        return;
      }

      document.computeConnections = document.computeConnections.filter(
        (connection) => buildFlowChartConnectionKey(connection) !== connectionKey,
      );
    });
    setSelection(buildEmptySelection());
  }, [selectedConnectionItem, updateActiveDocument]);

  const beginConnection = useCallback((kind: FlowChartConnectionKind, sourceNodeId: number, sourcePortId: number) => {
    setPendingConnection({
      kind,
      sourceNodeId,
      sourcePortId,
    });
  }, []);

  const cancelPendingConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  const completePendingConnection = useCallback(
    (targetNodeId: number, targetPortId: number) => {
      if (!activeDocument || !pendingConnection) {
        return;
      }

      const sourceNode = activeDocument.nodes.find((node) => node.nodeId === pendingConnection.sourceNodeId);
      const targetNode = activeDocument.nodes.find((node) => node.nodeId === targetNodeId);
      if (!sourceNode || !targetNode) {
        setPendingConnection(null);
        return;
      }

      const sourceDefinition = resolvedDefinitionsByType[sourceNode.nodeType];
      const targetDefinition = resolvedDefinitionsByType[targetNode.nodeType];
      const sourcePort = getFlowChartPortDescriptor(sourceDefinition, pendingConnection.kind, pendingConnection.sourcePortId);
      const targetPort = getFlowChartPortDescriptor(targetDefinition, pendingConnection.kind, targetPortId);
      if (!sourcePort || sourcePort.direction !== "output" || !targetPort || targetPort.direction !== "input") {
        setPendingConnection(null);
        return;
      }

      const nextConnection: FlowChartConnection = {
        sourceNodeId: sourceNode.nodeId,
        sourcePortId: pendingConnection.sourcePortId,
        targetNodeId,
        targetPortId,
      };
      const nextKey = buildFlowChartConnectionKey(nextConnection);

      updateActiveDocument((document) => {
        const connections = pendingConnection.kind === "flow" ? document.flowConnections : document.computeConnections;
        if (connections.some((connection) => buildFlowChartConnectionKey(connection) === nextKey)) {
          return;
        }

        connections.push(nextConnection);
      });

      setPendingConnection(null);
      setSelection(buildConnectionSelection(pendingConnection.kind, [nextKey], "replace", buildEmptySelection(), nextKey));
    },
    [activeDocument, pendingConnection, resolvedDefinitionsByType, updateActiveDocument],
  );

  const copySelection = useCallback(() => {
    if (!activeDocument) {
      return false;
    }

    const snapshot = buildClipboardSnapshot(activeDocument, selection);
    if (!snapshot) {
      return false;
    }

    clipboardStateRef.current = {
      snapshot,
      pasteSequence: 0,
    };
    setClipboardVersion((current) => current + 1);
    return true;
  }, [activeDocument, selection]);

  const cutSelection = useCallback(() => {
    const copied = copySelection();
    if (!copied) {
      return false;
    }

    deleteSelection();
    return true;
  }, [copySelection, deleteSelection]);

  const pasteClipboard = useCallback(() => {
    if (activeFlowChartState.status !== "ready") {
      return false;
    }

    const snapshot = clipboardStateRef.current.snapshot;
    if (!snapshot) {
      return false;
    }

    const pasteSequence = clipboardStateRef.current.pasteSequence + 1;
    clipboardStateRef.current = {
      snapshot,
      pasteSequence,
    };
    setClipboardVersion((current) => current + 1);

    const nodeIdMap = new Map<number, number>();
    const nextBaseNodeId = activeFlowChartState.document.nodes.reduce((maxNodeId, node) => Math.max(maxNodeId, node.nodeId), 0);
    const offset = 36 * pasteSequence;
    const nextNodes = snapshot.nodes.map((node, index) => {
      const nextNodeId = nextBaseNodeId + index + 1;
      nodeIdMap.set(node.nodeId, nextNodeId);
      return {
        nodeId: nextNodeId,
        nodeType: node.nodeType,
        layout: {
          x: Math.max(0, Math.round(node.layout.x + offset)),
          y: Math.max(0, Math.round(node.layout.y + offset)),
        },
        propertyValues: node.propertyValues.map((entry) => ({
          propertyId: entry.propertyId,
          value: structuredClone(entry.value),
        })),
      };
    });

    const remapConnection = (connection: FlowChartConnection): FlowChartConnection | null => {
      const sourceNodeId = nodeIdMap.get(connection.sourceNodeId);
      const targetNodeId = nodeIdMap.get(connection.targetNodeId);
      if (!sourceNodeId || !targetNodeId) {
        return null;
      }

      return {
        sourceNodeId,
        sourcePortId: connection.sourcePortId,
        targetNodeId,
        targetPortId: connection.targetPortId,
      };
    };

    updateActiveDocument((document) => {
      document.nodes.push(...nextNodes);
      document.flowConnections.push(...snapshot.flowConnections.map(remapConnection).filter((value): value is FlowChartConnection => value !== null));
      document.computeConnections.push(...snapshot.computeConnections.map(remapConnection).filter((value): value is FlowChartConnection => value !== null));
    });

    const nextNodeIds = nextNodes.map((node) => node.nodeId);
    setSelection(buildNodeSelection(nextNodeIds, "replace", buildEmptySelection(), nextNodeIds[0]));
    return true;
  }, [activeFlowChartState, updateActiveDocument]);

  const selectAll = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    const allNodeIds = activeDocument.nodes.map((node) => node.nodeId);
    setSelection(buildNodeSelection(allNodeIds, "replace", buildEmptySelection(), allNodeIds[0]));
  }, [activeDocument]);

  const saveActiveFlowChart = useCallback(async () => {
    if (!hostInfo || !workspacePath || !activeFlowChartPath || activeFlowChartState.status !== "ready") {
      return false;
    }

    if (validationIssues.length > 0) {
      const errorMessage = `当前存在 ${validationIssues.length} 个阻断问题，无法保存流程图。`;
      setSaveState("error");
      setSaveError(errorMessage);
      onToast({
        title: "流程图保存被阻止",
        detail: errorMessage,
        source: "save",
        variant: "error",
        canOpenDetail: true,
      });
      return false;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await fetchJson<FlowChartFileResponse>(`${hostInfo.desktopHostUrl}/api/workspace/flowcharts/files/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspacePath,
          relativePath: activeFlowChartPath,
          document: activeFlowChartState.document,
        }),
      });

      setActiveFlowChartState({
        status: "ready",
        dirty: false,
        response,
        document: cloneFlowChartFileDocument(response.document ?? activeFlowChartState.document),
      });
      reloadCatalog();
      setSaveState("saved");
      setSaveError(null);
      onToast({
        title: "流程图已保存",
        summary: activeFlowChartPath,
        source: "save",
        variant: "success",
        canOpenDetail: false,
        durationMs: 2400,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "流程图保存失败。";
      setSaveState("error");
      setSaveError(message);
      onToast({
        title: "流程图保存失败",
        summary: activeFlowChartPath,
        detail: message,
        source: "save",
        variant: "error",
        canOpenDetail: true,
      });
      return false;
    }
  }, [activeFlowChartPath, activeFlowChartState, hostInfo, onToast, reloadCatalog, validationIssues.length, workspacePath]);

  return {
    catalog,
    catalogError,
    catalogStatus,
    activeDocument,
    activeFlowChartPath,
    activeFlowChartState,
    activeSummary,
    validationIssues,
    resolvedDefinitionsByType,
    selection,
    selectedNode,
    selectedNodes,
    selectedConnection: selectedConnectionItem?.connection ?? null,
    selectedConnectionItem,
    selectedNodeCount: selectedNodes.length,
    selectedConnectionCount,
    hasSelection,
    pendingConnection,
    saveState,
    saveError,
    canSaveActiveFlowChart,
    canPasteClipboard,
    clipboardVersion,
    createFlowChart,
    createFlowChartDirectory,
    renameFlowChartDirectory,
    deleteFlowChartDirectory,
    deleteFlowChartFile,
    saveFlowChartMetadata,
    selectFlowChart,
    clearSelection,
    selectNode,
    selectNodes,
    selectConnection,
    moveNode,
    moveSelectedNodes,
    addNode,
    alignSelectedNodes,
    distributeSelectedNodes,
    autoLayoutNodes,
    updateActiveFlowChartMeta,
    updateNodePropertyValue,
    resetNodePropertyValue,
    deleteSelection,
    deleteSelectedNode,
    deleteSelectedConnection,
    beginConnection,
    cancelPendingConnection,
    completePendingConnection,
    reloadCatalog,
    reloadActiveFlowChart,
    saveActiveFlowChart,
    ensureNodeDefinition,
    copySelection,
    cutSelection,
    pasteClipboard,
    selectAll,
  };
}