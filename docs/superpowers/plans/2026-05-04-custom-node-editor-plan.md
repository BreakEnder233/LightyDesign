# 节点定义编辑器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加一个可视化的节点定义编辑器对话框，允许用户在 UI 中创建和编辑 FlowChartNodeDefinitionDocument，保存为 .json 定义文件供流程图实例使用。

**Architecture:** 在流程图编辑器侧栏节点树中通过右键菜单打开一个模态对话框（FlowChartNodeDefinitionDialog）。对话框左侧为表格列表（属性、计算端口、流程端口），右侧为行详情编辑面板。类型选择复用现有的 TypeComposerDialog。工具函数（BuilderNode ↔ TypeRef 转换、校验）放在独立的 `flowchartNodeDefinitionSchema.ts` 中。

**Tech Stack:** React + TypeScript, 现有流程图编辑器组件库

---

### Task 1: 工具函数 — flowchartNodeDefinitionSchema.ts

**Files:**
- Create: `app/desktop/src/flowchart-editor/utils/flowchartNodeDefinitionSchema.ts`

- [ ] **Step 1: 创建文件并实现 BuilderNode → FlowChartTypeRef 转换函数**

```typescript
// app/desktop/src/flowchart-editor/utils/flowchartNodeDefinitionSchema.ts

import type {
  FlowChartNodeDefinitionDocument,
  FlowChartNodeKind,
  FlowChartTypeRef,
} from "../types/flowchartEditor";
import type { BuilderNode } from "../../workbook-editor/components/TypeComposerDialog";

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
```

- [ ] **Step 2: 实现 FlowChartTypeRef → BuilderNode 反向转换**

```typescript
/**
 * 将 FlowChartTypeRef 转换为 BuilderNode。
 * custom 类型返回 null，由调用方回退到手动输入模式。
 */
export function typeRefToBuilderNode(typeRef: FlowChartTypeRef): BuilderNode | null {
  if (typeRef.kind === "builtin") {
    return { kind: "scalar", scalarType: typeRef.name };
  }
  if (typeRef.kind === "list") {
    const elementNode = typeRefToBuilderNode(typeRef.elementType);
    return elementNode
      ? { kind: "container", containerType: "List", elementType: elementNode, keyType: null, valueType: null }
      : null;
  }
  if (typeRef.kind === "dictionary") {
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
```

- [ ] **Step 3: 实现空定义创建函数**

```typescript
/**
 * 构建一个空的节点定义，包含自动生成的初始属性、端口。
 */
export function buildEmptyNodeDefinition(
  name: string,
  alias: string,
  nodeKind: FlowChartNodeKind,
): FlowChartNodeDefinitionDocument {
  const initialFlowPorts =
    nodeKind === "compute"
      ? []
      : [{ portId: 1, name: "Enter", direction: "input" as const }];

  const initialComputePorts =
    nodeKind === "compute"
      ? [{ portId: 1, name: "Result", alias: null, direction: "output" as const, type: { kind: "builtin" as const, name: "void" } }]
      : [];

  return {
    formatVersion: "1.0",
    name,
    alias: alias || null,
    nodeKind,
    properties: [],
    computePorts: initialComputePorts,
    flowPorts: initialFlowPorts,
  };
}
```

- [ ] **Step 4: 实现 ID 生成器**

```typescript
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
```

- [ ] **Step 5: 实现名称校验**

```typescript
/** 校验 name 是否是有效的英文标识符 */
export function isValidIdentifierName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/** 校验相对路径是否有效 */
export function isValidRelativePath(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_/]*$/.test(name);
}
```

- [ ] **Step 6: 实现结构校验**

```typescript
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
```

---

### Task 2: 在 useFlowChartEditor 中暴露加载/保存方法

**Files:**
- Modify: `app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts`

- [ ] **Step 1: 添加 loadNodeDefinition 方法**

在 `useFlowChartEditor` hook 的 return 对象之前，添加以下方法：

```typescript
const loadNodeDefinition = useCallback(
  async (relativePath: string): Promise<FlowChartNodeDefinitionResponse | null> => {
    if (!hostInfo || !workspacePath) {
      onToast({
        title: "无法加载节点定义",
        detail: "请先打开一个工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
      });
      return null;
    }

    try {
      return await fetchJson<FlowChartNodeDefinitionResponse>(
        buildApiUrl(hostInfo, `/api/workspace/flowcharts/nodes/${encodeFlowChartRelativePath(relativePath)}`, workspacePath),
      );
    } catch (error) {
      onToast({
        title: "节点定义加载失败",
        summary: relativePath,
        detail: error instanceof Error ? error.message : "未能读取节点定义。",
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
      });
      return null;
    }
  },
  [hostInfo, onToast, workspacePath],
);
```

- [ ] **Step 2: 添加 saveNodeDefinition 方法**

```typescript
const saveNodeDefinition = useCallback(
  async (
    relativePath: string,
    document: FlowChartNodeDefinitionDocument,
  ): Promise<boolean> => {
    if (!hostInfo || !workspacePath) {
      onToast({
        title: "无法保存节点定义",
        detail: "请先打开一个工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
      });
      return false;
    }

    try {
      await fetchJson<FlowChartNodeDefinitionResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/flowcharts/nodes/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspacePath,
            relativePath,
            document,
          }),
        },
      );

      reloadCatalog();
      reloadNodeDefinitions();
      onToast({
        title: "节点定义已保存",
        summary: relativePath,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 2400,
      });
      return true;
    } catch (error) {
      onToast({
        title: "节点定义保存失败",
        summary: relativePath,
        detail: error instanceof Error ? error.message : "未能保存节点定义。",
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
      });
      return false;
    }
  },
  [hostInfo, onToast, reloadCatalog, reloadNodeDefinitions, workspacePath],
);
```

- [ ] **Step 3: 将新方法添加到 return 语句的末尾**

在 `useFlowChartEditor` 的 return 对象中追加：

```typescript
loadNodeDefinition,
saveNodeDefinition,
```

---

### Task 3: FlowChartNodeDefinitionDialog 组件

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/FlowChartNodeDefinitionDialog.tsx`

这是一个较大的组件，拆分为多个子步骤。

- [ ] **Step 1: 定义 Props 类型和组件骨架**

```typescript
// app/desktop/src/flowchart-editor/components/FlowChartNodeDefinitionDialog.tsx
import { useEffect, useMemo, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";
import type { TypeMetadataResponse } from "../../workbook-editor/types/desktopApp";
import { TypeComposerDialog } from "../../workbook-editor/components/TypeComposerDialog";

import type {
  FlowChartNodeDefinitionDocument,
  FlowChartNodeKind,
  FlowChartPropertyDefinition,
  FlowChartComputePortDefinition,
  FlowChartFlowPortDefinition,
} from "../types/flowchartEditor";
import {
  builderNodeToTypeRef,
  typeRefToBuilderNode,
  getNextPropertyId,
  getNextPortId,
  validateNodeDefinitionStructure,
} from "../utils/flowchartNodeDefinitionSchema";

export type NodeDefinitionDialogMode = "create" | "edit";

export type FlowChartNodeDefinitionDialogProps = {
  isOpen: boolean;
  mode: NodeDefinitionDialogMode;
  /** 创建模式下初始的相对路径（含目录前缀） */
  initialRelativePath: string;
  /** 编辑模式下加载的已有定义 */
  existingDefinition: FlowChartNodeDefinitionDocument | null;
  /** 要编辑的现有相对路径（编辑模式） */
  existingRelativePath: string | null;
  typeMetadata: TypeMetadataResponse | null;
  onClose: () => void;
  onSubmit: (relativePath: string, document: FlowChartNodeDefinitionDocument) => Promise<boolean>;
  onResolveType: (type: string) => Promise<{ ok: boolean; normalizedType?: string; message?: string }>;
};
```

- [ ] **Step 2: 实现行编辑状态和一个类型辅助**

```typescript
type DetailEditTarget =
  | { kind: "property"; propertyId: number }
  | { kind: "computePort"; portId: number }
  | { kind: "flowPort"; portId: number }
  | null;

type PortDirection = "input" | "output";
```

- [ ] **Step 3: 实现组件主体（对话框布局 + 状态管理）**

完整的组件代码（包含状态管理、表格渲染、详情面板、TypeComposerDialog 集成、保存逻辑）：

```typescript
export function FlowChartNodeDefinitionDialog({
  isOpen,
  mode,
  initialRelativePath,
  existingDefinition,
  existingRelativePath,
  typeMetadata,
  onClose,
  onSubmit,
  onResolveType,
}: FlowChartNodeDefinitionDialogProps) {
  // ── 编辑状态 ──
  const [relativePath, setRelativePath] = useState(initialRelativePath);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [nodeKind, setNodeKind] = useState<FlowChartNodeKind>("event");
  const [properties, setProperties] = useState<FlowChartPropertyDefinition[]>([]);
  const [computePorts, setComputePorts] = useState<FlowChartComputePortDefinition[]>([]);
  const [flowPorts, setFlowPorts] = useState<FlowChartFlowPortDefinition[]>([]);
  const [detailTarget, setDetailTarget] = useState<DetailEditTarget>(null);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [typePickerTarget, setTypePickerTarget] = useState<"property" | "computePort" | null>(null);
  const [typePickerPropertyId, setTypePickerPropertyId] = useState<number | null>(null);
  const [typePickerPortId, setTypePickerPortId] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateNodeDefinitionStructure>>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ── 初始化 / 重置 ──
  useEffect(() => {
    if (!isOpen) return;

    if (mode === "edit" && existingDefinition) {
      setRelativePath(existingRelativePath ?? initialRelativePath);
      setName(existingDefinition.name);
      setAlias(existingDefinition.alias ?? "");
      setNodeKind(existingDefinition.nodeKind);
      setProperties([...existingDefinition.properties]);
      setComputePorts([...existingDefinition.computePorts]);
      setFlowPorts([...existingDefinition.flowPorts]);
    } else {
      setRelativePath(initialRelativePath);
      setName(initialRelativePath.split("/").pop() ?? "NewNode");
      setAlias("");
      setNodeKind("event");
      setProperties([]);
      setComputePorts([]);
      setFlowPorts([
        { portId: 1, name: "Enter", direction: "input" },
        { portId: 2, name: "Then", direction: "output" },
      ]);
    }

    setDetailTarget(null);
    setErrors([]);
    setIsSaving(false);
  }, [isOpen, mode, existingDefinition, existingRelativePath, initialRelativePath]);

  // ── 校验 ──
  useEffect(() => {
    const document: FlowChartNodeDefinitionDocument = {
      formatVersion: "1.0",
      name,
      alias: alias || null,
      nodeKind,
      properties,
      computePorts,
      flowPorts,
    };
    setErrors(validateNodeDefinitionStructure(document));
  }, [name, alias, nodeKind, properties, computePorts, flowPorts]);

  // ── 构建当前文档，用于提交 ──
  const currentDocument = useMemo<FlowChartNodeDefinitionDocument>(() => ({
    formatVersion: "1.0",
    name,
    alias: alias || null,
    nodeKind,
    properties,
    computePorts,
    flowPorts,
  }), [name, alias, nodeKind, properties, computePorts, flowPorts]);

  // ── 属性操作 ──
  function addProperty() {
    const nextId = getNextPropertyId(currentDocument);
    setProperties((prev) => [
      ...prev,
      { propertyId: nextId, name: `Property${nextId}`, type: { kind: "builtin", name: "string" }, defaultValue: "" },
    ]);
    setDetailTarget({ kind: "property", propertyId: nextId });
  }

  function updateProperty(propertyId: number, patch: Partial<FlowChartPropertyDefinition>) {
    setProperties((prev) => prev.map((p) => (p.propertyId === propertyId ? { ...p, ...patch } : p)));
  }

  function removeProperty(propertyId: number) {
    setProperties((prev) => prev.filter((p) => p.propertyId !== propertyId));
    setDetailTarget((prev) => {
      if (prev?.kind === "property" && prev.propertyId === propertyId) return null;
      return prev;
    });
  }

  // ── 计算端口操作 ──
  function addComputePort() {
    const nextId = getNextPortId(currentDocument, "compute");
    setComputePorts((prev) => [
      ...prev,
      { portId: nextId, name: `Compute${nextId}`, alias: null, direction: "input", type: { kind: "builtin", name: "int32" } },
    ]);
    setDetailTarget({ kind: "computePort", portId: nextId });
  }

  function updateComputePort(portId: number, patch: Partial<FlowChartComputePortDefinition>) {
    setComputePorts((prev) => prev.map((p) => (p.portId === portId ? { ...p, ...patch } : p)));
  }

  function removeComputePort(portId: number) {
    setComputePorts((prev) => prev.filter((p) => p.portId !== portId));
    setDetailTarget((prev) => {
      if (prev?.kind === "computePort" && prev.portId === portId) return null;
      return prev;
    });
  }

  // ── 流程端口操作 ──
  function addFlowPort() {
    const nextId = getNextPortId(currentDocument, "flow");
    setFlowPorts((prev) => [
      ...prev,
      { portId: nextId, name: `Flow${nextId}`, direction: "input" },
    ]);
    setDetailTarget({ kind: "flowPort", portId: nextId });
  }

  function updateFlowPort(portId: number, patch: Partial<FlowChartFlowPortDefinition>) {
    setFlowPorts((prev) => prev.map((p) => (p.portId === portId ? { ...p, ...patch } : p)));
  }

  function removeFlowPort(portId: number) {
    setFlowPorts((prev) => prev.filter((p) => p.portId !== portId));
    setDetailTarget((prev) => {
      if (prev?.kind === "flowPort" && prev.portId === portId) return null;
      return prev;
    });
  }

  // ── 类型选择器 ──
  function openTypePicker(target: "property" | "computePort", targetId: number) {
    setTypePickerTarget(target);
    if (target === "property") {
      setTypePickerPropertyId(targetId);
      setTypePickerPortId(null);
    } else {
      setTypePickerPortId(targetId);
      setTypePickerPropertyId(null);
    }
    setIsTypePickerOpen(true);
  }

  function handleTypePickerClose() {
    setIsTypePickerOpen(false);
    setTypePickerTarget(null);
    setTypePickerPropertyId(null);
    setTypePickerPortId(null);
  }

  function handleTypePickerApply(node: import("../../workbook-editor/components/TypeComposerDialog").BuilderNode) {
    const typeRef = builderNodeToTypeRef(node);
    if (typePickerTarget === "property" && typePickerPropertyId !== null) {
      updateProperty(typePickerPropertyId, { type: typeRef });
    } else if (typePickerTarget === "computePort" && typePickerPortId !== null) {
      updateComputePort(typePickerPortId, { type: typeRef });
    }
    handleTypePickerClose();
  }

  // ── 提交 ──
  async function handleSubmit() {
    const validationErrors = validateNodeDefinitionStructure(currentDocument);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(relativePath, currentDocument);
    } finally {
      setIsSaving(false);
    }
  }

  // ── 获取详情目标的数据 ──
  const detailData = useMemo(() => {
    if (!detailTarget) return null;
    if (detailTarget.kind === "property") {
      return properties.find((p) => p.propertyId === detailTarget.propertyId) ?? null;
    }
    if (detailTarget.kind === "computePort") {
      return computePorts.find((p) => p.portId === detailTarget.portId) ?? null;
    }
    return flowPorts.find((p) => p.portId === detailTarget.portId) ?? null;
  }, [detailTarget, properties, computePorts, flowPorts]);

  // ── 阻止渲染 ──
  if (!isOpen) return null;

  const hasBlockingErrors = errors.length > 0;

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label="节点定义编辑器" aria-modal="true" className="workspace-create-dialog flowchart-node-dialog" role="dialog">
        {/* ── 顶部 header ── */}
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{mode === "create" ? "新建节点定义" : "编辑节点定义"}</p>
            <strong>{relativePath}</strong>
          </div>
          {hasBlockingErrors ? <span className="badge flowchart-badge-error">{errors.length} 个问题</span> : null}
        </div>

        <div className="workspace-create-body">
          <div className="flowchart-node-dialog-grid">
            {/* ── 左侧：主编辑区 ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflow: "auto" }}>
              {/* 顶层字段 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>相对路径</span>
                  <input
                    onChange={(e) => setRelativePath(e.target.value)}
                    placeholder="Event/Player/OnEnterScene"
                    type="text"
                    value={relativePath}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>名称 (name) *</span>
                  <input
                    onChange={(e) => setName(e.target.value)}
                    placeholder="OnEnterScene"
                    type="text"
                    value={name}
                  />
                </label>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>别名 (alias)</span>
                  <input
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="进入场景"
                    type="text"
                    value={alias}
                  />
                </label>
                <label className="search-field compact-field" style={{ flex: "0 0 120px" }}>
                  <span>节点种类</span>
                  <select
                    className="dialog-field-select"
                    onChange={(e) => setNodeKind(e.target.value as FlowChartNodeKind)}
                    value={nodeKind}
                  >
                    <option value="event">event</option>
                    <option value="flow">flow</option>
                    <option value="compute">compute</option>
                  </select>
                </label>
              </div>

              {/* 属性表格 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="flowchart-node-section-header" style={{ padding: 0 }}>属性</span>
                  <button className="secondary-button flowchart-library-add-button" onClick={addProperty} type="button">+ 添加属性</button>
                </div>
                {properties.length === 0 ? (
                  <p className="status-detail" style={{ padding: "4px 0" }}>暂无属性定义，点击上方按钮添加。</p>
                ) : (
                  <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 160, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>别名</th>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>类型</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", width: 80 }}>默认值</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {properties.map((prop) => (
                          <tr
                            key={prop.propertyId}
                            onClick={() => setDetailTarget({ kind: "property", propertyId: prop.propertyId })}
                            style={{
                              cursor: "pointer",
                              borderBottom: "1px solid #2a2a2a",
                              background: detailTarget?.kind === "property" && detailTarget.propertyId === prop.propertyId ? "#0f2434" : undefined,
                            }}
                          >
                            <td style={{ padding: "4px 6px" }}>{prop.name}</td>
                            <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{prop.alias ?? ""}</td>
                            <td style={{ padding: "4px 6px", color: "#4fc1ff" }}>
                              {prop.type.kind === "builtin" ? prop.type.name : prop.type.kind === "custom" ? prop.type.name : prop.type.kind}
                            </td>
                            <td style={{ padding: "4px 6px" }}>{String(prop.defaultValue ?? "")}</td>
                            <td style={{ padding: "4px 6px" }}>
                              <button
                                className="tree-context-menu-item is-danger"
                                onClick={(e) => { e.stopPropagation(); removeProperty(prop.propertyId); }}
                                style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                type="button"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 计算端口 + 流程端口并排 */}
              <div style={{ display: "flex", gap: 8 }}>
                {/* 计算端口 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="flowchart-node-section-header" style={{ padding: 0 }}>计算端口</span>
                    <button className="secondary-button flowchart-library-add-button" onClick={addComputePort} type="button">+ 添加</button>
                  </div>
                  {computePorts.length === 0 ? (
                    <p className="status-detail" style={{ padding: "4px 0" }}>暂无</p>
                  ) : (
                    <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 120, overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>方向</th>
                            <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {computePorts.map((port) => (
                            <tr
                              key={port.portId}
                              onClick={() => setDetailTarget({ kind: "computePort", portId: port.portId })}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid #2a2a2a",
                                background: detailTarget?.kind === "computePort" && detailTarget.portId === port.portId ? "#0f2434" : undefined,
                              }}
                            >
                              <td style={{ padding: "4px 6px" }}>{port.name}</td>
                              <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{port.direction}</td>
                              <td style={{ padding: "4px 6px" }}>
                                <button
                                  className="tree-context-menu-item is-danger"
                                  onClick={(e) => { e.stopPropagation(); removeComputePort(port.portId); }}
                                  style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 流程端口 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="flowchart-node-section-header" style={{ padding: 0 }}>流程端口</span>
                    <button className="secondary-button flowchart-library-add-button" onClick={addFlowPort} type="button">+ 添加</button>
                  </div>
                  {flowPorts.length === 0 ? (
                    <p className="status-detail" style={{ padding: "4px 0" }}>暂无</p>
                  ) : (
                    <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 120, overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>方向</th>
                            <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {flowPorts.map((port) => (
                            <tr
                              key={port.portId}
                              onClick={() => setDetailTarget({ kind: "flowPort", portId: port.portId })}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid #2a2a2a",
                                background: detailTarget?.kind === "flowPort" && detailTarget.portId === port.portId ? "#0f2434" : undefined,
                              }}
                            >
                              <td style={{ padding: "4px 6px" }}>{port.name}</td>
                              <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{port.direction}</td>
                              <td style={{ padding: "4px 6px" }}>
                                <button
                                  className="tree-context-menu-item is-danger"
                                  onClick={(e) => { e.stopPropagation(); removeFlowPort(port.portId); }}
                                  style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 校验错误 */}
              {errors.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, border: "1px solid #5a1d1d", background: "rgba(90,29,29,0.18)" }}>
                  {errors.map((err, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 11, color: "#f2b8b5" }}>{err.field}: {err.message}</p>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ── 右侧：详情编辑面板 ── */}
            <div className="tree-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
              <strong style={{ fontSize: 12 }}>详情编辑</strong>
              {!detailTarget || !detailData ? (
                <p className="status-detail">点击左侧列表中的行展开编辑详情。</p>
              ) : detailTarget.kind === "property" ? (
                <PropertyDetailEditor
                  data={detailData as FlowChartPropertyDefinition}
                  onChange={(patch) => updateProperty(detailTarget.propertyId, patch)}
                  onOpenTypePicker={() => openTypePicker("property", detailTarget.propertyId)}
                />
              ) : detailTarget.kind === "computePort" ? (
                <ComputePortDetailEditor
                  data={detailData as FlowChartComputePortDefinition}
                  onChange={(patch) => updateComputePort(detailTarget.portId, patch)}
                  onOpenTypePicker={() => openTypePicker("computePort", detailTarget.portId)}
                />
              ) : (
                <FlowPortDetailEditor
                  data={detailData as FlowChartFlowPortDefinition}
                  onChange={(patch) => updateFlowPort(detailTarget.portId, patch)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── 底部操作栏 ── */}
        <div className="workspace-create-actions">
          <button className="secondary-button" disabled={isSaving} onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={hasBlockingErrors || isSaving} onClick={() => void handleSubmit()} type="button">
            {isSaving ? "保存中" : "保存定义"}
          </button>
        </div>

        {/* ── TypeComposerDialog ── */}
        {isTypePickerOpen ? (
          <TypeComposerDialog
            allowedKinds={["scalar", "container"]}
            applyLabel="应用到类型"
            currentType=""
            depth={0}
            initialNode={null}
            isOpen={isTypePickerOpen}
            onApplyNode={(node) => handleTypePickerApply(node)}
            onClose={handleTypePickerClose}
            onResolveType={onResolveType}
            subtitle="选择属性/端口的类型"
            title={typePickerTarget === "property" ? "选择属性类型" : "选择端口类型"}
            typeMetadata={typeMetadata as any}
          />
        ) : null}
      </div>
    </DialogBackdrop>
  );
}
```

- [ ] **Step 4: 实现三个详情子编辑器组件**

```typescript
// ── 属性详情编辑器 ──
function PropertyDetailEditor({
  data,
  onChange,
  onOpenTypePicker,
}: {
  data: FlowChartPropertyDefinition;
  onChange: (patch: Partial<FlowChartPropertyDefinition>) => void;
  onOpenTypePicker: () => void;
}) {
  const isCustomType = data.type.kind === "custom";
  const typeLabel = isCustomType
    ? (data.type as any).fullName ?? data.type.name
    : data.type.kind === "builtin"
      ? data.type.name
      : data.type.kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>类型</span>
        <div style={{ display: "flex", gap: 4 }}>
          <input className="dialog-field-input" readOnly style={{ flex: 1 }} type="text" value={typeLabel} />
          <button className="secondary-button flowchart-library-add-button" onClick={onOpenTypePicker} type="button">选择类型</button>
        </div>
      </label>
      <label className="flowchart-inspector-field">
        <span>默认值</span>
        <input
          className="dialog-field-input"
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          type="text"
          value={String(data.defaultValue ?? "")}
        />
      </label>
    </div>
  );
}

// ── 计算端口详情编辑器 ──
function ComputePortDetailEditor({
  data,
  onChange,
  onOpenTypePicker,
}: {
  data: FlowChartComputePortDefinition;
  onChange: (patch: Partial<FlowChartComputePortDefinition>) => void;
  onOpenTypePicker: () => void;
}) {
  const isCustomType = data.type.kind === "custom";
  const typeLabel = isCustomType
    ? (data.type as any).fullName ?? data.type.name
    : data.type.kind === "builtin"
      ? data.type.name
      : data.type.kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>方向</span>
        <select className="dialog-field-select" onChange={(e) => onChange({ direction: e.target.value as PortDirection })} value={data.direction}>
          <option value="input">input</option>
          <option value="output">output</option>
        </select>
      </label>
      <label className="flowchart-inspector-field">
        <span>类型</span>
        <div style={{ display: "flex", gap: 4 }}>
          <input className="dialog-field-input" readOnly style={{ flex: 1 }} type="text" value={typeLabel} />
          <button className="secondary-button flowchart-library-add-button" onClick={onOpenTypePicker} type="button">选择类型</button>
        </div>
      </label>
    </div>
  );
}

// ── 流程端口详情编辑器 ──
function FlowPortDetailEditor({
  data,
  onChange,
}: {
  data: FlowChartFlowPortDefinition;
  onChange: (patch: Partial<FlowChartFlowPortDefinition>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>方向</span>
        <select className="dialog-field-select" onChange={(e) => onChange({ direction: e.target.value as PortDirection })} value={data.direction}>
          <option value="input">input</option>
          <option value="output">output</option>
        </select>
      </label>
    </div>
  );
}
```

---

### Task 4: FlowChartEditorView 集成对话框

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx`

- [ ] **Step 1: 导入新组件和类型**

在现有 import 块中添加：

```typescript
import { FlowChartNodeDefinitionDialog, type NodeDefinitionDialogMode } from "./FlowChartNodeDefinitionDialog";
import { fetchJson } from "../../utils/desktopHost";
import type { TypeMetadataResponse } from "../../workbook-editor/types/desktopApp";
```

- [ ] **Step 2: 添加状态变量**

在 `FlowChartEditorView` 组件内部，现有 state 声明区域添加：

```typescript
const [isNodeDefinitionDialogOpen, setIsNodeDefinitionDialogOpen] = useState(false);
const [nodeDefinitionDialogMode, setNodeDefinitionDialogMode] = useState<NodeDefinitionDialogMode>("create");
const [nodeDefinitionDialogRelativePath, setNodeDefinitionDialogRelativePath] = useState("");
const [nodeDefinitionDialogExisting, setNodeDefinitionDialogExisting] = useState<FlowChartNodeDefinitionDocument | null>(null);
const [nodeDefinitionDialogExistingPath, setNodeDefinitionDialogExistingPath] = useState<string | null>(null);
const [typeMetadata, setTypeMetadata] = useState<TypeMetadataResponse | null>(null);
```

- [ ] **Step 3: 添加 typeMetadata 加载副作用**

```typescript
useEffect(() => {
  if (!editor.hostInfo || !workspacePath) {
    setTypeMetadata(null);
    return;
  }

  let cancelled = false;
  void fetchJson<TypeMetadataResponse>(
    `${editor.hostInfo.desktopHostUrl}/api/workspace/type-metadata?workspacePath=${encodeURIComponent(workspacePath)}`,
  )
    .then((response) => {
      if (!cancelled) setTypeMetadata(response);
    })
    .catch(() => {
      if (!cancelled) setTypeMetadata(null);
    });

  return () => { cancelled = true; };
}, [editor.hostInfo, workspacePath]);
```

- [ ] **Step 4: 添加对话框打开处理函数**

```typescript
function handleOpenCreateNodeDefinition(baseDirectory: string) {
  const suggestedName = baseDirectory ? `${baseDirectory}/NewNode` : "NewNode";
  setNodeDefinitionDialogMode("create");
  setNodeDefinitionDialogRelativePath(suggestedName);
  setNodeDefinitionDialogExisting(null);
  setNodeDefinitionDialogExistingPath(null);
  setIsNodeDefinitionDialogOpen(true);
}

function handleOpenEditNodeDefinition(relativePath: string) {
  // 从 catalog 和现有加载的 definitions 中找到文档
  const definitionResponse = editor.nodeDefinitionsByPath[relativePath];
  if (definitionResponse?.document) {
    setNodeDefinitionDialogMode("edit");
    setNodeDefinitionDialogRelativePath(relativePath);
    setNodeDefinitionDialogExisting(definitionResponse.document);
    setNodeDefinitionDialogExistingPath(relativePath);
    setIsNodeDefinitionDialogOpen(true);
    return;
  }

  // 使用 loadNodeDefinition
  void editor.loadNodeDefinition(relativePath).then((response) => {
    if (response?.document) {
      setNodeDefinitionDialogMode("edit");
      setNodeDefinitionDialogRelativePath(relativePath);
      setNodeDefinitionDialogExisting(response.document);
      setNodeDefinitionDialogExistingPath(relativePath);
      setIsNodeDefinitionDialogOpen(true);
    }
  });
}
```

- [ ] **Step 5: 添加对话框提交处理函数**

```typescript
async function handleNodeDefinitionSubmit(
  relativePath: string,
  document: FlowChartNodeDefinitionDocument,
): Promise<boolean> {
  const saved = await editor.saveNodeDefinition(relativePath, document);
  if (saved) {
    setIsNodeDefinitionDialogOpen(false);
    // 如果当前流程图使用了该节点类型，刷新
    editor.reloadNodeDefinitions();
  }
  return saved;
}
```

- [ ] **Step 6: 添加 dialog 渲染（在 JSX 末尾，</> 之前）**

```tsx
<FlowChartNodeDefinitionDialog
  existingDefinition={nodeDefinitionDialogExisting}
  existingRelativePath={nodeDefinitionDialogExistingPath}
  initialRelativePath={nodeDefinitionDialogRelativePath}
  isOpen={isNodeDefinitionDialogOpen}
  mode={nodeDefinitionDialogMode}
  onClose={() => setIsNodeDefinitionDialogOpen(false)}
  onSubmit={handleNodeDefinitionSubmit}
  onResolveType={async (type) => {
    if (!editor.hostInfo || !workspacePath) {
      return { ok: false, message: "工作区未就绪" };
    }
    try {
      return await fetchJson<{ ok: boolean; normalizedType?: string; message?: string }>(
        `${editor.hostInfo.desktopHostUrl}/api/workspace/type-validation?type=${encodeURIComponent(type)}&workspacePath=${encodeURIComponent(workspacePath)}`,
      );
    } catch {
      return { ok: false, message: "类型校验失败" };
    }
  }}
  typeMetadata={typeMetadata}
/>
```

并确保 `handleOpenCreateNodeDefinition` 和 `handleOpenEditNodeDefinition` 通过 props 传递给 `FlowChartSidebar`。

- [ ] **Step 7: 更新 FlowChartSidebar 的 props 传递**

修改 `FlowChartEditorView` 中 `<FlowChartSidebar>` 的 props：

```tsx
<FlowChartSidebar
  // ... existing props ...
  onOpenCreateNodeDefinition={handleOpenCreateNodeDefinition}
  onOpenEditNodeDefinition={handleOpenEditNodeDefinition}
/>
```

---

### Task 5: FlowChartSidebar — 添加上下文菜单入口

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx`

- [ ] **Step 1: 在 Props 类型中添加新回调**

在 `FlowChartSidebarProps` 中添加：

```typescript
onOpenCreateNodeDefinition?: (baseDirectory: string) => void;
onOpenEditNodeDefinition?: (relativePath: string) => void;
```

- [ ] **Step 2: 在节点定义右键菜单中添加"编辑定义"项**

在 `contextMenu.target.kind === "node-definition"` 区块中，在"添加到当前流程图"之前添加：

```tsx
{onOpenEditNodeDefinition ? (
  <button
    className="tree-context-menu-item"
    onClick={() => runMenuAction(() => onOpenEditNodeDefinition(target.relativePath))}
    type="button"
  >
    编辑定义
  </button>
) : null}
```

- [ ] **Step 3: 在目录右键菜单中添加"新建节点定义"项**

在 `contextMenu.target.kind === "directory"` 区块中，在"新建目录"之前添加：

```tsx
{target.scope === "nodes" && onOpenCreateNodeDefinition ? (
  <button
    className="tree-context-menu-item"
    onClick={() => runMenuAction(() => onOpenCreateNodeDefinition(target.relativePath ?? ""))}
    type="button"
  >
    新建节点定义
  </button>
) : null}
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 验证创建流程**

1. 打开流程图编辑器，切换到"节点树"选项卡
2. 右键节点根目录 → "新建节点定义"
3. 填写名称 "TestEvent"，选择 nodeKind "event"
4. 添加一个属性 "PlayerName" 类型 string
5. 点击"保存定义"
6. 验证：节点树中出现了 TestEvent 节点
7. 打开流程图，从节点树将 TestEvent 拖入画布
8. 验证：节点渲染正确，属性显示 PlayerName

- [ ] **Step 2: 验证编辑流程**

1. 右键 TestEvent → "编辑定义"
2. 修改别名，添加一个计算端口
3. 点击"保存定义"
4. 验证：画布上已有的 TestEvent 实例是否需要刷新后更新

- [ ] **Step 3: 验证校验**

1. 创建新定义，选择 nodeKind "event"
2. 删除所有流程端口
3. 验证：保存按钮禁用，显示"事件节点至少需要一个流程输出端口"

- [ ] **Step 4: 验证 TypeComposerDialog 集成**

1. 编辑一个属性的类型
2. 点击"选择类型"按钮
3. 验证：TypeComposerDialog 打开，允许选择 scalar 和 container
4. 选择 List<int32>
5. 验证：属性类型更新为 List<int32>
