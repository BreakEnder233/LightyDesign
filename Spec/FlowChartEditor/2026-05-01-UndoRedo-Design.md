# FlowChartEditor Undo/Redo 设计文档

日期: 2026-05-01

## 背景

流程图编辑器 (`app/desktop/src/flowchart-editor/`) 当前缺少撤销/重做能力。工作表编辑器已有成熟的 Undo/Redo 实现（命令模式），但流程图编辑器的文档结构和交互模式更适合采用全文快照方案。

## 方案选择：全文快照

选用全文快照而非命令模式，原因如下：

1. **流程图文档体积小**：典型流程图 10-100 个节点，深拷贝 ~10KB，50 条快照峰值 < 500KB
2. **零反操作 Bug**：快照恢复是完美还原，不存在命令模式下反操作不匹配的风险
3. **已有克隆机制**：`updateActiveDocument()` 每次变更已做 `cloneFlowChartFileDocument()`，快照几乎"免费"
4. **全覆盖**：新增操作类型自动获得 Undo/Redo 支持
5. **实现简单**：约 150 行核心代码 + 在已有 15 个突变点各插入 1 行

## 数据结构

```typescript
type FlowChartUndoEntry = {
  document: FlowChartFileDocument;   // 完整文档快照
  selection: FlowChartSelection;     // 对应的选区状态
};
```

在 `useFlowChartEditor` 中新增两个 state：

```typescript
const [undoStack, setUndoStack] = useState<FlowChartUndoEntry[]>([]);
const [redoStack, setRedoStack] = useState<FlowChartUndoEntry[]>([]);
const canUndo = undoStack.length > 0;
const canRedo = redoStack.length > 0;
```

**栈上限**：50 条。超过时移除最早的条目。

## 核心流程

### pushUndoEntry()

在每次突变前调用，捕获当前文档快照 + 选区。

```typescript
function pushUndoEntry() {
  const doc = documentRef.current;
  const sel = selectionRef.current;
  if (!doc) return;
  setUndoStack(prev => {
    const next = [...prev, {
      document: cloneFlowChartFileDocument(doc),
      selection: JSON.parse(JSON.stringify(sel)),  // 浅克隆即可，selection 只有 primitive
    }];
    return next.length <= 50 ? next : next.slice(next.length - 50);
  });
  setRedoStack([]);  // 新操作清除 redo
}
```

使用 `documentRef` / `selectionRef` 确保闭包中拿到最新值。

### undo()

```typescript
function undo() {
  const entry = undoStack[undoStack.length - 1];
  if (!entry || !activeDocument) return;
  const currentEntry: FlowChartUndoEntry = {
    document: cloneFlowChartFileDocument(activeDocument),
    selection: selectionRef.current,
  };
  setUndoStack(prev => prev.slice(0, -1));
  setRedoStack(prev => [...prev, currentEntry]);
  restoreDocument(entry.document, entry.selection);
}
```

### redo()

```typescript
function redo() {
  const entry = redoStack[redoStack.length - 1];
  if (!entry || !activeDocument) return;
  const currentEntry: FlowChartUndoEntry = {
    document: cloneFlowChartFileDocument(activeDocument),
    selection: selectionRef.current,
  };
  setRedoStack(prev => prev.slice(0, -1));
  setUndoStack(prev => [...prev, currentEntry]);
  restoreDocument(entry.document, entry.selection);
}
```

### restoreDocument()

```typescript
function restoreDocument(document: FlowChartFileDocument, selection: FlowChartSelection) {
  setActiveFlowChartState(prev => {
    if (prev.status !== "ready") return prev;
    return {
      ...prev,
      dirty: true,
      document,
      response: { ...prev.response, document },
    };
  });
  setSelection(selection);
  setSaveState("idle");
  setSaveError(null);
}
```

## 突变操作集成

所有突变操作前插入 `pushUndoEntry()`。以下是完整的集成清单：

| 操作函数 | 位置 | 调用时机 |
|---|---|---|
| `addNode` | 已有的 `updateActiveDocument` 前 | 添加节点前 |
| `deleteSelection` | `updateActiveDocument` 前 | 删除选区前 |
| `deleteSelectedNode` | `updateActiveDocument` 前 | 删除节点前 |
| `deleteSelectedConnection` | `updateActiveDocument` 前 | 删除连线前 |
| `completePendingConnection` | `updateActiveDocument` 前 | 完成连线前 |
| `disconnectPort` | `updateActiveDocument` 前 | 断开端口前 |
| `updateNodePropertyValue` | `updateActiveDocument` 前 | 修改属性前 |
| `resetNodePropertyValue` | `updateActiveDocument` 前 | 重置属性前 |
| `alignSelectedNodes` | `updateActiveDocument` 前 | 对齐前 |
| `distributeSelectedNodes` | `updateActiveDocument` 前 | 分布前 |
| `autoLayoutNodes` | `updateActiveDocument` 前 | 自动排版前 |
| `pasteClipboard` | `updateActiveDocument` 前 | 粘贴前 |
| **拖拽开始**（Canvas 端） | `onPointerDown` 时 | 首次按下时调用一次 |

**拖拽处理**：`moveSelectedNodes` 在拖拽过程中被高频调用（~60fps），不会在每次调用时推入 undo。改为在 Canvas 组件的 `onPointerDown` 触发拖拽时调用一次 `pushUndoEntry()`，后续所有 delta 视为一个原子操作。

## 栈生命周期

| 事件 | 行为 |
|---|---|
| 打开新流程图 | 清空两栈 |
| 关闭流程图 | 清空两栈 |
| 保存流程图 | 不清空（与工作表编辑器不同，流程图编辑器更像 IDE 行为） |
| 任何新突变 | 清除 `redoStack` |

## 快捷键

在 `App.tsx` 的 `flowChartShortcutBindings` 中新增（沿用 `useEditorShortcuts` 系统）：

```typescript
{
  id: "undo-flowchart-edit",
  label: "撤销流程图编辑",
  hint: "Ctrl+Z",
  enabled: flowChartEditor.canUndo,
  matches: event => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "z",
  run: flowChartEditor.undo,
},
{
  id: "redo-flowchart-edit",
  label: "恢复流程图编辑",
  hint: "Ctrl+Y / Ctrl+Shift+Z",
  enabled: flowChartEditor.canRedo,
  matches: event =>
    isShortcutModifierPressed(event) &&
    ((event.key.toLowerCase() === "y" && !event.shiftKey) ||
     (event.key.toLowerCase() === "z" && event.shiftKey)),
  run: flowChartEditor.redo,
},
```

注意：`useEditorShortcuts.ts` 中的 `isNativeEditingShortcut` 包含 `z` 和 `y`，所以当焦点在可编辑元素（input/textarea）时会保留原生行为，不会与流程图快捷键冲突。

## 需要修改的文件

| 文件 | 改动 |
|---|---|
| `flowchart-editor/hooks/useFlowChartEditor.ts` | 核心逻辑：+undoStack/redoStack state, refs, pushUndoEntry, undo, redo, canUndo/canRedo, restoreDocument；各突变点插入 pushUndoEntry；暴露新 API |
| `flowchart-editor/components/FlowChartCanvas.tsx` | 拖拽开始时调用 pushUndoEntry |
| `App.tsx` | flowChartShortcutBindings 添加 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z |

## 验证方式

1. 打开一个流程图，依次执行：添加节点 → 移动节点 → 添加连线 → 编辑属性
2. Ctrl+Z 逐一撤销，验证每步状态（文档 + 选区）正确
3. Ctrl+Y 逐一重做，验证步骤恢复
4. 执行新突变（如删除节点），验证 redoStack 被清空
5. 拖拽节点 → Ctrl+Z，验证整个拖拽作为一个原子操作被撤销
6. 执行超过 50 次操作，验证栈截断正确（最早的操作丢失，最近 50 条保留）
7. 切换/关闭流程图，验证栈被清空
8. 保存流程图后继续编辑+撤销，验证保存不清空栈
