import type {
  FlowChartConnection,
  FlowChartFileDocument,
  FlowChartFlowPortDefinition,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
  FlowChartPortDescriptor,
  FlowChartTypeRef,
  FlowChartValidationIssue,
} from "../types/flowchartEditor";

export const flowChartNodeWidth = 292;

const nodeHeaderHeight = 42;
const sectionHeaderHeight = 20;
const propertyRowHeight = 26;
const portRowHeight = 24;
const nodeBottomPadding = 10;

export function getFlowChartNodeLayoutMetrics(definition: FlowChartNodeDefinitionDocument | undefined) {
  const propertyCount = definition?.properties.length ?? 0;
  const computeCount = definition?.computePorts.length ?? 0;
  const flowCount = definition?.flowPorts.length ?? 0;

  let cursor = nodeHeaderHeight;
  const propertySectionStart = cursor;
  if (propertyCount > 0) {
    cursor += sectionHeaderHeight + propertyCount * propertyRowHeight;
  }

  const computeSectionStart = cursor;
  if (computeCount > 0) {
    cursor += sectionHeaderHeight + computeCount * portRowHeight;
  }

  const flowSectionStart = cursor;
  if (flowCount > 0) {
    cursor += sectionHeaderHeight + flowCount * portRowHeight;
  }

  return {
    propertySectionStart,
    computeSectionStart,
    flowSectionStart,
    height: cursor + nodeBottomPadding,
    sectionHeaderHeight,
    portRowHeight,
  };
}

export function getFlowChartNodeRect(node: FlowChartNodeInstance, definition: FlowChartNodeDefinitionDocument | undefined) {
  const metrics = getFlowChartNodeLayoutMetrics(definition);
  return {
    x: node.layout.x,
    y: node.layout.y,
    width: flowChartNodeWidth,
    height: metrics.height,
  };
}

export function formatFlowChartTypeRef(typeRef: FlowChartTypeRef | null | undefined): string {
  if (!typeRef || typeof typeRef !== "object" || !("kind" in typeRef)) {
    return "unknown";
  }

  switch (typeRef.kind) {
    case "builtin":
      return typeRef.name;
    case "custom":
      return typeRef.fullName ?? typeRef.name;
    case "list":
      return `List<${formatFlowChartTypeRef(typeRef.elementType)}>`;
    case "dictionary":
      return `Dictionary<${formatFlowChartTypeRef(typeRef.keyType)}, ${formatFlowChartTypeRef(typeRef.valueType)}>`;
    default:
      return "unknown";
  }
}

export function buildFlowChartConnectionKey(connection: FlowChartConnection) {
  return `${connection.sourceNodeId}:${connection.sourcePortId}->${connection.targetNodeId}:${connection.targetPortId}`;
}

export function cloneFlowChartFileDocument(document: FlowChartFileDocument): FlowChartFileDocument {
  return {
    formatVersion: document.formatVersion,
    name: document.name,
    alias: document.alias ?? null,
    nodes: document.nodes.map((node) => ({
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
    })),
    flowConnections: document.flowConnections.map((connection) => ({ ...connection })),
    computeConnections: document.computeConnections.map((connection) => ({ ...connection })),
  };
}

export function findNodePropertyValue(node: FlowChartNodeInstance, propertyId: number) {
  return node.propertyValues.find((entry) => entry.propertyId === propertyId)?.value;
}

export function upsertNodePropertyValue(node: FlowChartNodeInstance, propertyId: number, value: unknown) {
  const existingIndex = node.propertyValues.findIndex((entry) => entry.propertyId === propertyId);
  if (existingIndex >= 0) {
    node.propertyValues[existingIndex] = {
      propertyId,
      value,
    };
    return;
  }

  node.propertyValues.push({
    propertyId,
    value,
  });
}

export function removeNodePropertyValue(node: FlowChartNodeInstance, propertyId: number) {
  node.propertyValues = node.propertyValues.filter((entry) => entry.propertyId !== propertyId);
}

export function getFlowChartPortDescriptor(
  definition: FlowChartNodeDefinitionDocument | null | undefined,
  kind: "flow" | "compute",
  portId: number,
): FlowChartPortDescriptor | null {
  if (!definition) {
    return null;
  }

  if (kind === "flow") {
    const port = definition.flowPorts.find((candidate) => candidate.portId === portId);
    if (!port) {
      return null;
    }

    return {
      kind,
      direction: port.direction,
      portId: port.portId,
      name: port.name,
      alias: port.alias,
    };
  }

  const port = definition.computePorts.find((candidate) => candidate.portId === portId);
  if (!port) {
    return null;
  }

  return {
    kind,
    direction: port.direction,
    portId: port.portId,
    name: port.name,
    alias: port.alias,
    type: port.type,
  };
}

function isSamePort(leftNodeId: number, leftPortId: number, rightNodeId: number, rightPortId: number) {
  return leftNodeId === rightNodeId && leftPortId === rightPortId;
}

function ensurePortCardinality(
  issues: FlowChartValidationIssue[],
  kind: "flow" | "compute",
  connections: FlowChartConnection[],
) {
  const outputCount = new Map<string, number>();
  const inputCount = new Map<string, number>();

  connections.forEach((connection) => {
    const outputKey = `${connection.sourceNodeId}:${connection.sourcePortId}`;
    const inputKey = `${connection.targetNodeId}:${connection.targetPortId}`;
    outputCount.set(outputKey, (outputCount.get(outputKey) ?? 0) + 1);
    inputCount.set(inputKey, (inputCount.get(inputKey) ?? 0) + 1);
  });

  outputCount.forEach((count, key) => {
    if (kind === "flow" && count > 1) {
      issues.push({
        id: `${kind}-output-${key}`,
        severity: "error",
        message: `流程输出端口 ${key} 同时连到了多条边。一个流程输出端口最多只能连接一条流程边。`,
      });
    }
  });

  inputCount.forEach((count, key) => {
    if (kind === "compute" && count > 1) {
      issues.push({
        id: `${kind}-input-${key}`,
        severity: "error",
        message: `计算输入端口 ${key} 同时接收了多条边。一个计算输入端口最多只能接收一条计算边。`,
      });
    }
  });
}

function validateConnections(
  issues: FlowChartValidationIssue[],
  document: FlowChartFileDocument,
  definitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>,
  kind: "flow" | "compute",
  connections: FlowChartConnection[],
) {
  const nodesById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const duplicateConnectionKeys = new Set<string>();

  connections.forEach((connection) => {
    const key = buildFlowChartConnectionKey(connection);
    if (duplicateConnectionKeys.has(key)) {
      issues.push({
        id: `${kind}-duplicate-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 重复出现。`,
      });
      return;
    }

    duplicateConnectionKeys.add(key);

    const sourceNode = nodesById.get(connection.sourceNodeId);
    const targetNode = nodesById.get(connection.targetNodeId);
    if (!sourceNode || !targetNode) {
      issues.push({
        id: `${kind}-missing-node-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 引用了不存在的节点。`,
      });
      return;
    }

    const sourceDefinition = definitionsByType[sourceNode.nodeType];
    const targetDefinition = definitionsByType[targetNode.nodeType];
    const sourcePort = getFlowChartPortDescriptor(sourceDefinition, kind, connection.sourcePortId);
    const targetPort = getFlowChartPortDescriptor(targetDefinition, kind, connection.targetPortId);
    if (!sourcePort || !targetPort) {
      issues.push({
        id: `${kind}-missing-port-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 引用了不存在的端口。`,
      });
      return;
    }

    if (sourcePort.direction !== "output") {
      issues.push({
        id: `${kind}-invalid-source-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 的源端口不是输出端口。`,
      });
    }

    if (targetPort.direction !== "input") {
      issues.push({
        id: `${kind}-invalid-target-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 的目标端口不是输入端口。`,
      });
    }

    if (isSamePort(connection.sourceNodeId, connection.sourcePortId, connection.targetNodeId, connection.targetPortId)) {
      issues.push({
        id: `${kind}-self-port-${key}`,
        severity: "error",
        message: `${kind === "flow" ? "流程" : "计算"}连接 ${key} 不能直接回连到同一个端口。`,
      });
    }
  });

  ensurePortCardinality(issues, kind, connections);
}

function detectComputeCycles(connections: FlowChartConnection[]) {
  const adjacency = new Map<number, Set<number>>();
  connections.forEach((connection) => {
    if (!adjacency.has(connection.sourceNodeId)) {
      adjacency.set(connection.sourceNodeId, new Set<number>());
    }

    adjacency.get(connection.sourceNodeId)?.add(connection.targetNodeId);
  });

  const visiting = new Set<number>();
  const visited = new Set<number>();

  function dfs(nodeId: number): boolean {
    if (visiting.has(nodeId)) {
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          return true;
        }
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const nodeId of adjacency.keys()) {
    if (dfs(nodeId)) {
      return true;
    }
  }

  return false;
}

export function validateFlowChartDocument(
  document: FlowChartFileDocument,
  definitionsByType: Record<string, FlowChartNodeDefinitionDocument | undefined>,
): FlowChartValidationIssue[] {
  const issues: FlowChartValidationIssue[] = [];
  const nodeIdSet = new Set<number>();

  document.nodes.forEach((node) => {
    if (!Number.isInteger(node.nodeId) || node.nodeId <= 0) {
      issues.push({
        id: `node-id-${node.nodeId}`,
        severity: "error",
        message: `节点 ${node.nodeType} 使用了非法 nodeId ${node.nodeId}。nodeId 必须是大于 0 的整数。`,
      });
    }

    if (nodeIdSet.has(node.nodeId)) {
      issues.push({
        id: `node-duplicate-${node.nodeId}`,
        severity: "error",
        message: `流程图内存在重复的 nodeId ${node.nodeId}。`,
      });
    }

    nodeIdSet.add(node.nodeId);

    const definition = definitionsByType[node.nodeType];
    if (!definition) {
      issues.push({
        id: `node-definition-${node.nodeId}`,
        severity: "error",
        message: `节点 ${node.nodeId} 引用了不存在的节点类型 ${node.nodeType}。`,
      });
      return;
    }

    node.propertyValues.forEach((entry) => {
      if (!definition.properties.some((property) => property.propertyId === entry.propertyId)) {
        issues.push({
          id: `node-property-${node.nodeId}-${entry.propertyId}`,
          severity: "error",
          message: `节点 ${node.nodeId} 的属性覆盖引用了不存在的 propertyId ${entry.propertyId}。`,
        });
      }
    });
  });

  validateConnections(issues, document, definitionsByType, "flow", document.flowConnections);
  validateConnections(issues, document, definitionsByType, "compute", document.computeConnections);

  if (detectComputeCycles(document.computeConnections)) {
    issues.push({
      id: "compute-cycle",
      severity: "error",
      message: "当前计算连线形成了回路。计算连接图不允许出现环。",
    });
  }

  return issues;
}

export function findFlowPortDefinition(definition: FlowChartNodeDefinitionDocument | null | undefined, portId: number): FlowChartFlowPortDefinition | null {
  if (!definition) {
    return null;
  }

  return definition.flowPorts.find((port) => port.portId === portId) ?? null;
}