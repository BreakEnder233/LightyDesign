# 节点定义编辑器设计文档

## 概述

为流程图编辑器添加**节点定义可视化编辑器**，允许用户在 UI 中创建和编辑 `FlowChartNodeDefinitionDocument`（节点类型的定义本身），而无需手动编辑 JSON 文件。编辑后的定义保存为 `.json` 文件，供流程图实例使用。

## 约束

1. 入口**仅限侧栏节点树**，不允许从流程图画布节点或检查器编辑定义。
2. 类型选择**复用**现有的 `TypeComposerDialog` 组件。
3. 流程图节点定义不需要 reference（表引用）类型，只允许 scalar 和 container。

## 交互入口

### 允许的入口

| 入口 | 操作 | 说明 |
|------|------|------|
| 侧栏节点树 → 右键节点定义 | "编辑定义" | 打开已存在定义的编辑器 |
| 侧栏节点树 → 右键目录 | "新建节点定义" | 创建新定义，默认填入路径 |
| 侧栏节点选项卡 → 根目录菜单 | "新建节点定义" | 同上 |

### 禁止的入口

| 入口 | 原因 |
|------|------|
| 流程图画布 → 右键节点 | 节点实例不应直接编辑定义 |
| 浮动检查器 | 属性编辑 ≠ 定义编辑 |

## 对话框布局

采用模态对话框形式，宽度 920px（与 `FlowChartNodeDialog` 一致），分为两个区域：

### 左侧：定义主编辑区

#### 顶层字段（对话框顶部横排）

| 字段 | 控件 | 说明 |
|------|------|------|
| 名称 (name) | 文本输入 | 英文标识符，用于生成类名 |
| 别名 (alias) | 文本输入 | 展示名称，可为空 |
| 节点种类 (nodeKind) | 下拉选择 | event / flow / compute 三选一 |

#### 属性 (Properties) 表格

表格列：拖拽排序手柄 | 名称 | 别名 | 类型 | 默认值 | 删除按钮

- 支持行点击 → 右侧详情面板展开编辑
- 拖拽排序（基础版本支持点击排序按钮移动）
- "添加属性"按钮在表格上方
- 约束校验：propertyId 自动生成，不可编辑

#### 计算端口 (Compute Ports) 表格

表格列：拖拽排序手柄 | 名称 | 类型 | 方向 | 删除按钮

- 方向固定为 input / output 下拉
- 类型调用 TypeComposerDialog 选择

#### 流程端口 (Flow Ports) 表格

表格列：拖拽排序手柄 | 名称 | 方向 | 删除按钮

- 流程端口没有类型字段
- 方向固定为 input / output 下拉

### 右侧：详情编辑面板

点击左侧表格中的行后展开，编辑该行完整信息：

- 名称（必填）
- 别名（可选）
- 类型（属性/计算端口）：文本框 + "选择类型"按钮 → 打开 TypeComposerDialog
- 默认值（仅属性）
- 方向（仅端口）

### 底部操作栏

- 取消按钮：关闭对话框，不保存
- 保存定义按钮：调用后端 API 保存

## TypeComposerDialog 集成

### 类型分类与编辑方式

流程图节点定义的 TypeRef 有三种情况，编辑方式不同：

| TypeRef kind | 示例 | 编辑方式 |
|-------------|------|---------|
| `builtin` | `int32`, `string`, `float`, `bool` | TypeComposerDialog (scalar 模式) |
| `container` | `List<int32>`, `Dictionary<string, int>` | TypeComposerDialog (container 模式) |
| `custom` | `Vector3`, `SceneContext` | **手动输入**（文本框），无对话框 |

选择类型按钮的行为：
- 如果当前类型是 builtin 或 container → 打开 TypeComposerDialog
- 如果当前类型是 custom → 变为"清除"按钮，允许用户切换回 builtin 再打开对话框
- 用户可以直接在文本框中输入任意类型名称（包括 custom 类型）

### typeMetadata 来源

复用现有的 `/api/workspace/type-metadata` 端点获取 `TypeMetadataResponse`，与 Workbook 编辑器一致。

### 调用参数

```typescript
{
  allowedKinds: ["scalar", "container"],
  currentType: "int32",           // 当前类型的字符串表示
  initialNode: BuilderNode | null,
  title: "选择属性类型" | "选择端口类型",
  applyLabel: "应用到类型",
  typeMetadata: TypeMetadataResponse,
  onResolveType: (type: string) => Promise<TypeValidationResponse>,
}
```

### 返回值

通过 `onApplyNode` 回调接收选择后的 `BuilderNode`，转换为 `FlowChartTypeRef` 后设置到属性/端口。

### BuilderNode → FlowChartTypeRef 转换

```typescript
function builderNodeToTypeRef(node: BuilderNode): FlowChartTypeRef {
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
  // reference types are not used in flowchart node definitions
  throw new Error("Unsupported BuilderNode kind for flowchart type ref");
}
```

```typescript
function typeRefToBuilderNode(typeRef: FlowChartTypeRef): BuilderNode | null {
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
      kind: "container", containerType: "Dictionary",
      elementType: null,
      keyType: typeRefToBuilderNode(typeRef.keyType),
      valueType: typeRefToBuilderNode(typeRef.valueType),
    };
  }
  // custom types: return null → fall back to manual text input
  return null;
}
```

## 后端 API 交互

### 保存节点定义

```
POST /api/workspace/flowcharts/nodes/save
{
  workspacePath: string,
  relativePath: string,
  document: FlowChartNodeDefinitionDocument
}
```

### 新建时

1. 调用 `POST /api/workspace/flowcharts/nodes/save` 保存定义
2. 自动刷新侧栏节点树
3. 对话框保持打开状态或关闭（由用户决定）

### 编辑已有定义

1. 通过 `GET /api/workspace/flowcharts/nodes/{relativePath}` 加载现有定义
2. 在对话框中编辑
3. 调用 `POST /api/workspace/flowcharts/nodes/save` 保存（覆盖）

## 需要新增的文件

| 文件 | 说明 |
|------|------|
| `FlowChartNodeDefinitionDialog.tsx` | 节点定义编辑器对话框主组件 |
| `flowchartNodeDefinitionSchema.ts` | 节点定义操作的校验/转换工具函数 |

## 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `FlowChartSidebar.tsx` | 节点树右键菜单增加"编辑定义"和"新建节点定义"项 |
| `FlowChartEditorView.tsx` | 集成 `FlowChartNodeDefinitionDialog`，管理 dialog state |
| `useFlowChartEditor.ts` | 暴露 `loadNodeDefinition` / `saveNodeDefinition` 方法 |
| `flowchartEditor.ts` (types) | 可能需要为编辑器 mode 补充类型 |
| `flowchartNodeCreate.ts` | 工具函数：BuilderNode → TypeRef 转换 |

## 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `FlowChartCanvas.tsx` | 入口限制，画布不涉及定义编辑 |
| `FlowChartFloatingInspector.tsx` | 同上 |
| `FlowChartInspector.tsx` | 同上 |
| `FlowChartNodeDialog.tsx` | 这是添加实例的对话框，保持不变 |
| 后端 `Program.cs` | 现有 API 已满足需求 |
| `FlowChartService.cs` | SaveNode / GetNodeDefinition 已实现 |

## 结构约束校验

编辑器应在保存前执行以下校验，并在 UI 中实时反馈：

### 通用校验

1. name 不能为空，必须是有效英文标识符（`^[a-zA-Z_][a-zA-Z0-9_]*$`）
2. nodeKind 必须是 `event` / `flow` / `compute`
3. propertyId 在定义内唯一（自动生成，不暴露给用户编辑）
4. portId 在计算端口/流程端口各自唯一（自动生成，不暴露给用户编辑）

### nodeKind 约束（UI 中实时提示）

| nodeKind | 约束 | 切换时 UI 行为 |
|----------|------|---------------|
| `event` | 不允许有流程输入端口；至少有一个流程输出端口 | 如果当前有 flowPorts 包含 input，切换时提示"事件节点不能有流程输入端口" |
| `flow` | 必须恰好有一个流程输入端口；至少有一个流程输出端口 | 如果当前 flowPorts 中 input 数量 ≠ 1，提示"流程节点需要恰好一个流程输入端口" |
| `compute` | 不允许有流程端口；至少有一个计算输出端口 | 如果当前有 flowPorts，切换时提示"计算节点不能有流程端口" |

### 实时校验反馈

- 校验错误在对话框内以行内提示或底部摘要形式显示
- 保存按钮在存在阻断性错误时禁用
- 校验逻辑可复用 `validateFlowChartDocument` 中的规则

## 实现顺序

1. 工具函数：BuilderNode ↔ TypeRef 转换，默认值生成
2. FlowChartNodeDefinitionDialog 组件（表格 + 详情面板 + TypeComposerDialog 集成）
3. useFlowChartEditor 暴露 load/save node definition 方法
4. FlowChartEditorView 集成 dialog state 管理
5. FlowChartSidebar 增加右键菜单入口
6. 端到端验证：创建定义 → 保存 → 在画布中使用
