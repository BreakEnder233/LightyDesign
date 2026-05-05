# 检查器面板与树视图优化设计文档

## 概述

对流程图编辑器的检查器面板和树视图进行多项 UI/UX 改进，包含：布局重构（浮动检查器→固定右侧面板）、树视图样式统一、节点树点击行为变更、以及批量属性编辑支持。

## 变更清单

1. 节点树点击默认行为改为打开节点定义编辑窗口
2. 浮动检查器改为固定右侧面板（三栏布局）
3. "恢复默认"按钮改为小图标按钮，放在字段编辑右侧
4. 树视图图标/样式统一为黑白灰+蓝色强调色
5. 批量属性编辑（同类节点多选）

---

## 1. 节点树点击行为变更

### 当前行为

`FlowChartSidebar.tsx` 中点击 `node-definition` 类型节点 → 调用 `onAddNode(relativePath)` 打开"添加到流程图"对话框。

### 目标行为

点击 `node-definition` 类型节点 → 调用 `onOpenEditNodeDefinition(relativePath)` 打开节点定义编辑窗口。

### 添加节点的新入口

- **右键菜单**："添加到当前流程图"选项保留
- **拖拽支持**：从节点树拖拽节点定义到画布，松开时在释放位置创建节点实例

### 拖拽实现方案

使用 HTML5 DragEvent API，与现有的 pointer-event 树内拖拽系统互不冲突：

- `TreeViewRow`：当 `item.metadata.kind === "node-definition"` 时设置 `draggable` 属性
- `onDragStart`：将节点路径写入 `dataTransfer`
- `FlowChartCanvas`：监听 `dragover`（preventDefault 以允许 drop）和 `drop` 事件
- 释放时将屏幕坐标转换为画布坐标，调用 `addNode(nodeType, canvasPosition)`

---

## 2. 三栏布局重构

### 当前布局

```
[Sidebar (resizable 220-520px)] [Canvas (flex-1)]
                                  [Floating Inspector (fixed overlay)]
```

### 目标布局

```
[Sidebar (resizable 220-520px)] [Canvas (flex-1)] [Inspector Panel (320px fixed)]
```

### 实现方式

`FlowChartEditorView.tsx` 的 `workspace-main` 容器改为 CSS Grid 三栏：

```css
.flowchart-editor-layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
}
```

右侧的 `FlowChartInspectorPanel` 宽度固定 320px，带 `border-left` 分割线。

### 面板状态

| 状态 | 条件 | 渲染行为 |
|------|------|---------|
| `hidden` | 未选中任何内容 | 不渲染，grid 列宽 0 |
| `empty` | 选中多个不同类型 / 选中连线 | 显示空状态提示 |
| `single` | 选中 1 个节点 | 显示单节点属性编辑 |
| `batch` | 选中 ≥2 个同类节点 | 显示批量编辑模式 |

状态为 `hidden` 时面板不渲染，画布占满全部空间。面板显示时画布自动收缩。

---

## 3. FlowChartInspectorPanel 组件

### 新建文件

`FlowChartInspectorPanel.tsx` — 替代 `FlowChartFloatingInspector.tsx` + `FlowChartInspector.tsx`

### 删除的旧文件

- `FlowChartFloatingInspector.tsx`（浮动定位逻辑全部不再需要）
- `FlowChartInspector.tsx`（功能迁移到新组件）

### Props

```typescript
type FlowChartInspectorPanelProps = {
  activeDocument: FlowChartFileDocument | null;
  selectedNodes: FlowChartNodeInstance[];
  selectedNodeCount: number;
  selectedNodeDefinitions: Map<string, FlowChartNodeDefinitionDocument>;
  onDeleteSelection: () => void;
  onDeleteSelectedNode: (nodeId: number) => void;
  onUpdateNodePropertyValue: (nodeId: number, propertyId: number, value: unknown) => void;
  onBatchUpdateNodePropertyValue: (nodeIds: number[], propertyId: number, value: unknown) => void;
};
```

### 子组件

- **PanelHeader**：显示标题 + 删除按钮
  - `single` 模式：节点别名/名称
  - `batch` 模式：`N个节点（TypeName）`
- **EmptyState**：根据场景显示提示文字
- **PropertyInput**：单节点属性编辑行（紧凑布局）
- **BatchPropertyInput**：批量属性编辑行（处理值一致/不一致）

### 面板模式判定

```typescript
function getPanelMode(selectedNodes, definitions): "hidden" | "empty" | "single" | "batch" {
  if (selectedNodes.length === 0) return "hidden";
  const types = new Set(selectedNodes.map(n => n.nodeType));
  if (types.size !== 1) return "empty";
  const def = definitions.get(types.values().next().value);
  if (!def) return "empty";
  if (selectedNodes.length === 1) return "single";
  return "batch";
}
```

---

## 4. 属性输入框紧凑布局（含"恢复默认"按钮）

### 单行布局

```
[字段别名/名称 (uppercase label)]          [类型名]
[输入框 (值 / placeholder="默认值: xxx")]   [↺ 恢复按钮]
```

### 恢复默认按钮

- 24×24 圆形图标按钮，使用旋转箭头 SVG（↺）
- 当前值 = defaultValue 时：置灰禁用（`opacity: 0.35`，cursor: not-allowed）
- 当前值 ≠ defaultValue 时：hover 变蓝色强调色 `#007acc`
- Boolean 类型：下拉框右侧放置
- Textarea 类型：右下角放置

### 输入框 placeholder

始终显示 `默认值: xxx`，提示用户默认值是什么。

---

## 5. 树视图样式改进

### TreeViewIcon 重新设计

所有图标改为线条风格，尺寸统一为 18×18：

| 类型 | 图形 | 颜色 |
|------|------|------|
| 目录（折叠） | 文件夹轮廓 | `#8b8b8b` |
| 目录（展开） | 文件夹打开轮廓 | `#8b8b8b` |
| 流程图文件 | 文档轮廓 | `#8b8b8b` |
| node-definition event | 圆角方块 + "E" | 边框/文字 `#4fc1ff` |
| node-definition flow | 圆角方块 + "F" | 边框/文字 `#72d08d` |
| node-definition compute | 圆角方块 + "C" | 边框/文字 `#f0b35b` |

选中行所有图标变为 `#007acc`（节点定义类型除外，保留颜色但加亮）。

### 展开/折叠箭头

- 从 8×8 放大到 **12×12**
- 描边加粗到 `strokeWidth: 1.5`
- 默认色 `#8b8b8b`，hover 行变 `#dcdcdc`

### 行样式修复

- 使用 `display: flex; align-items: center;` 确保图标/文字/badge 垂直居中
- 目录节点行底部间距 `4px`，叶子节点行底部间距 `2px`
- 叶子节点行取消边框，选中时使用 `2px` 左侧蓝色强调线（`inset 2px 0 0 #007acc`）
- 统一行最小高度，避免元素间高度不一致

---

## 6. 批量编辑模式

### 触发条件

- 选中 ≥2 个节点
- 所有节点 `nodeType` 相同（同类节点）
- 对应的 `FlowChartNodeDefinitionDocument` 已加载

### 字段显示规则

| 选中节点字段值 | 输入框显示 | 背景样式 |
|---------------|-----------|---------|
| 所有节点完全相同 | 正常显示值 | 正常 |
| 各节点不同 | `(多个值)` 占位符 | 浅色背景区分（如 `#2d2020`） |
| 所有节点为空/默认值 | 空 | 正常 |

### 编辑与保存逻辑

```
遍历节点定义的所有属性:
  如果用户修改了该属性 (有 draft):
    将所有选中节点的该属性设为新值
  如果用户未修改 (无 draft):
    每个节点保持原来的值不变
```

### 新增 useFlowChartEditor 方法

```typescript
function batchUpdateNodePropertyValue(
  nodeIds: number[],
  propertyId: number,
  value: unknown,
) {
  pushUndoEntry();
  const updatedNodes = activeDocument.nodes.map(node =>
    nodeIds.includes(node.nodeId)
      ? upsertNodePropertyValue(node, propertyId, value)
      : node
  );
  updateActiveDocument({ nodes: updatedNodes });
}
```

### 批量模式下的"恢复默认"

点击 `↺` 按钮：将该字段在所有选中节点中恢复为定义的 `defaultValue`。
如果所有节点该字段已全部为 defaultValue：按钮置灰。

---

## 7. 需要新增/修改/删除的文件

### 新增

| 文件 | 说明 |
|------|------|
| `FlowChartInspectorPanel.tsx` | 右侧固定检查器面板主组件 |
| (CSS 新增样式) | 在 `flowchart-editor.css` 中添加新样式 |

### 修改

| 文件 | 修改内容 |
|------|---------|
| `FlowChartSidebar.tsx` | 节点树点击行为改为 `onOpenEditNodeDefinition`；添加拖拽支持 |
| `TreeViewRow.tsx` | 添加 `draggable` 属性支持（node-definition 类型） |
| `TreeViewIcon.tsx` | 全部图标重新设计为黑白灰+蓝色强调风格 |
| `FlowChartEditorView.tsx` | 三栏布局重构；移除 `FlowChartFloatingInspector` 引用；传递新的 props |
| `useFlowChartEditor.ts` | 新增 `batchUpdateNodePropertyValue` 方法 |
| `flowchart-editor.css` | 大量样式更新：三栏布局、图标颜色、行样式、面板样式 |
| `TreeView.tsx` | 无需大改，但需确认 drag 事件不冲突 |

### 删除

| 文件 | 原因 |
|------|------|
| `FlowChartFloatingInspector.tsx` | 被 `FlowChartInspectorPanel` 替代 |
| `FlowChartInspector.tsx` | 功能迁移到新组件 |

---

## 8. 实现顺序

1. **TreeViewIcon 重新设计** — 独立改动，无依赖
2. **树视图行样式修复** — 独立改动（垂直居中、间距、箭头放大）
3. **节点树点击行为变更** — 简单的一行改动
4. **三栏布局重构** — FlowChartEditorView 布局变更
5. **FlowChartInspectorPanel 组件** — 核心组件，单节点编辑模式
6. **"恢复默认"按钮紧凑布局** — 在 PropertyInput 中实现
7. **批量编辑模式** — BatchPropertyInput + batchUpdateNodePropertyValue
8. **拖拽节点到画布** — TreeViewRow + FlowChartCanvas
9. **删除旧文件** — 确认功能正常后清理

## 9. 不修改的范围

- `FlowChartCanvas.tsx`：画布核心逻辑不受影响，仅添加 drop 事件监听
- `FlowChartNodeDefinitionDialog.tsx`：定义编辑对话框保持不变
- `FlowChartNodeDialog.tsx`：添加节点对话框保持不变
- 后端 API：无变更
- `FlowChartNodeDefinitionDocument` 类型定义：无变更
