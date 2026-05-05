import type {
  FlowChartNodeDefinitionDocument,
  FlowChartNodeKind,
  FlowChartTypeRef,
} from "../types/flowchartEditor";
import type { BuilderNode } from "../../workbook-editor/components/TypeComposerDialog";

/**
 * Type guard: 判断 FlowChartTypeRef 是否为 builtin 类型。
 * FlowChartTypeRef 包含 Record<string, unknown> 分支，导致直接 discriminated
 * union 缩小失效，故使用显式类型守卫。
 */
function isBuiltinRef(typeRef: FlowChartTypeRef): typeRef is { kind: "builtin"; name: string } {
  return typeof typeRef === "object" && typeRef !== null && "kind" in typeRef && typeRef.kind === "builtin";
}

/**
 * Type guard: 判断 FlowChartTypeRef 是否为 list 类型。
 */
function isListRef(typeRef: FlowChartTypeRef): typeRef is { kind: "list"; elementType: FlowChartTypeRef } {
  return typeof typeRef === "object" && typeRef !== null && "kind" in typeRef && typeRef.kind === "list";
}

/**
 * Type guard: 判断 FlowChartTypeRef 是否为 dictionary 类型。
 */
function isDictionaryRef(typeRef: FlowChartTypeRef): typeRef is { kind: "dictionary"; keyType: FlowChartTypeRef; valueType: FlowChartTypeRef } {
  return typeof typeRef === "object" && typeRef !== null && "kind" in typeRef && typeRef.kind === "dictionary";
}

/**
 * 将 TypeComposerDialog 的 BuilderNode 转换为 FlowChartTypeRef。
 * reference 类型在流程图节点定义中不使用，遇到时抛出错误。
 */
export function builderNodeToTypeRef(node: BuilderNode): FlowChartTypeRef {
  if (node.kind === "scalar") {
    return { kind: "builtin", name: node.scalarType };
  }
  if (node.kind === "container") {
    if (node.containerType === "List") {
      return {
        kind: "list",
        elementType: builderNodeToTypeRef(node.elementType!),
      };
    }
    return {
      kind: "dictionary",
      keyType: builderNodeToTypeRef(node.keyType!),
      valueType: builderNodeToTypeRef(node.valueType!),
    };
  }
  throw new Error("Unsupported BuilderNode kind for flowchart type ref");
}

/**
 * 将 FlowChartTypeRef 转换为 BuilderNode。
 * custom 类型返回 null，由调用方回退到手动输入模式。
 */
export function typeRefToBuilderNode(typeRef: FlowChartTypeRef): BuilderNode | null {
  if (isBuiltinRef(typeRef)) {
    return { kind: "scalar", scalarType: typeRef.name };
  }
  if (isListRef(typeRef)) {
    const elementNode = typeRefToBuilderNode(typeRef.elementType);
    return elementNode
      ? { kind: "container", containerType: "List", elementType: elementNode, keyType: null, valueType: null }
      : null;
  }
  if (isDictionaryRef(typeRef)) {
    return {
      kind: "container",
      containerType: "Dictionary",
      elementType: null,
      keyType: typeRefToBuilderNode(typeRef.keyType),
      valueType: typeRefToBuilderNode(typeRef.valueType),
    };
  }
  // custom types: fall back to manual text input
  return null;
}

/**
 * 构建一个空的节点定义，包含自动生成的初始属性、端口。
 */
export function buildEmptyNodeDefinition(
  name: string,
  alias: string,
  nodeKind: FlowChartNodeKind,
): FlowChartNodeDefinitionDocument {
  // Event: one output flow port (events must not have input flow ports)
  // Flow: one input + one output flow port (flow needs exactly one input)
  // Compute: no flow ports
  const initialFlowPorts =
    nodeKind === "event"
      ? [{ portId: 1, name: "Then", direction: "output" as const }]
      : nodeKind === "flow"
        ? [
            { portId: 1, name: "Enter", direction: "input" as const },
            { portId: 2, name: "Then", direction: "output" as const },
          ]
        : [];

  const initialComputePorts =
    nodeKind === "compute"
      ? [{ portId: 1, name: "Result", alias: null, direction: "output" as const, type: { kind: "builtin" as const, name: "void" } }]
      : [];

  return {
    formatVersion: "1.0",
    name,
    alias: alias || null,
    nodeKind,
    description: null,
    properties: [],
    computePorts: initialComputePorts,
    flowPorts: initialFlowPorts,
  };
}

/**
 * 为节点定义中的属性、端口生成下一个可用 ID。
 * ID 从 1 开始，0 保留为无效值。
 */
export function getNextPropertyId(
  definition: FlowChartNodeDefinitionDocument,
): number {
  return definition.properties.reduce((max, p) => Math.max(max, p.propertyId), 0) + 1;
}

export function getNextPortId(
  definition: FlowChartNodeDefinitionDocument,
  kind: "compute" | "flow",
): number {
  const ports = kind === "compute" ? definition.computePorts : definition.flowPorts;
  return ports.reduce((max, p) => Math.max(max, p.portId), 0) + 1;
}

/** 校验 name 是否是有效的英文标识符 */
export function isValidIdentifierName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/** 校验相对路径是否有效 */
export function isValidRelativePath(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_/]*$/.test(name);
}

export interface NodeDefinitionValidationError {
  field: string;
  message: string;
}

/**
 * 校验节点定义结构，返回所有错误。
 * 不阻断保存的错误使用 warning 级别。
 */
export function validateNodeDefinitionStructure(
  definition: FlowChartNodeDefinitionDocument,
): NodeDefinitionValidationError[] {
  const errors: NodeDefinitionValidationError[] = [];

  if (!isValidIdentifierName(definition.name)) {
    errors.push({ field: "name", message: "名称必须是有效的英文标识符（字母、数字、下划线）" });
  }

  const inputFlowCount = definition.flowPorts.filter((p) => p.direction === "input").length;
  const outputFlowCount = definition.flowPorts.filter((p) => p.direction === "output").length;
  const outputComputeCount = definition.computePorts.filter((p) => p.direction === "output").length;

  if (definition.nodeKind === "event") {
    if (inputFlowCount > 0) {
      errors.push({ field: "nodeKind", message: "事件节点不能有流程输入端口" });
    }
    if (outputFlowCount === 0) {
      errors.push({ field: "nodeKind", message: "事件节点至少需要一个流程输出端口" });
    }
  }

  if (definition.nodeKind === "flow") {
    if (inputFlowCount !== 1) {
      errors.push({ field: "nodeKind", message: "流程节点需要恰好一个流程输入端口" });
    }
    if (outputFlowCount === 0) {
      errors.push({ field: "nodeKind", message: "流程节点至少需要一个流程输出端口" });
    }
  }

  if (definition.nodeKind === "compute") {
    if (definition.flowPorts.length > 0) {
      errors.push({ field: "nodeKind", message: "计算节点不能有流程端口" });
    }
    if (outputComputeCount === 0) {
      errors.push({ field: "nodeKind", message: "计算节点至少需要一个计算输出端口" });
    }
  }

  return errors;
}
