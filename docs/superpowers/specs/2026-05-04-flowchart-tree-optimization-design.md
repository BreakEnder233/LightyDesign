# FlowChart 树优化 + 拖拽移动文件 设计文档

> 优化 FlowChartSidebar 中的流程图树和节点树的视觉表现，并添加拖拽移动文件/目录功能。

## 架构概览

采用 **TreeView 组件化重构**方案：

1. **提取通用 TreeView 组件**：将 FlowChartSidebar 中 900+ 行的内联递归树渲染提取为独立组件体系，支持虚拟化、键盘导航、拖拽、搜索高亮
2. **后端新增 Move API**：增加文件/目录移动端点
3. **前端拖拽系统**：基于 Pointer Events + React state 的统一拖拽层

## 组件架构

```
flowchart-editor/components/tree-view/
├── TreeView.tsx                  # 通用虚拟化树容器
├── TreeViewRow.tsx               # 单行渲染（目录/叶子）
├── TreeViewDragLayer.tsx         # 拖拽浮动预览层
├── TreeViewIcon.tsx               # SVG 图标集
├── TreeViewSearchHighlighter.tsx  # 搜索高亮文本
└── treeViewUtils.ts              # 树展平、排序、过滤工具
```

### TreeView 核心 API

```typescript
type TreeViewItem = {
  id: string;
  depth: number;
  kind: "directory" | "leaf";
  label: string;
  searchRanges?: [number, number][]; // 搜索匹配范围
  metadata: Record<string, unknown>;
};

type DropTarget = {
  kind: "directory" | "reorder";
  targetKey: string;
  position: "before" | "after" | "inside";
};

type TreeViewProps = {
  items: TreeViewItem[];
  expandedKeys: Set<string>;
  selectedKey: string | null;
  dragEnabled: boolean;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onContextMenu: (event: React.MouseEvent, item: TreeViewItem) => void;
  onDrop: (sourceKeys: string[], target: DropTarget) => void;
  renderIcon?: (item: TreeViewItem) => ReactNode;
  renderLabel?: (item: TreeViewItem) => ReactNode;
  renderBadge?: (item: TreeViewItem) => ReactNode;
};
```

### 展平策略（虚拟化）

将递归树结构展平为一维数组，仅渲染展开的节点，供虚拟滚动使用：

1. 从根目录开始 BFS
2. 跳过未展开的目录的子节点
3. 为每行计算 depth
4. 搜索激活时展开所有匹配的祖先路径

### 拖拽策略

- 使用 Pointer Events 而非 HTML5 DnD API（更好的控制、触摸支持、Electron 兼容性）
- 拖拽时显示浮动预览层（跟随指针的半透明卡片）
- 拖拽悬停在目录上 600ms 后自动展开该目录
- 放置目标精确到："插入到 X 之前"、"插入到 X 之后"、"放入 X 目录内"

### 视觉改进清单

| 项目 | 当前 | 改进后 |
|------|------|--------|
| 目录图标 | 无图标，只有文字 | 定制 SVG 文件夹图标（展开/折叠两种状态） |
| 文件图标 | 小圆点 | 流程图文件专用图标、节点定义图标 |
| 展开/折叠 | 瞬间切换 | CSS transition 动画（max-height + opacity） |
| 搜索高亮 | 无高亮，仅过滤 | 匹配文字黄色高亮背景 |
| 拖拽反馈 | 无 | 浮动预览 + 插入指示蓝线 + 目录高亮 |
| 选中状态 | 背景色变化 | 左边界彩色指示条 + 背景色 |
| 键盘导航 | 无 | ↑↓ 移动焦点，→ 展开，← 折叠，Enter 选中 |

## 后端 API

### 新增端点

```
POST /api/workspace/flowcharts/assets/files/move
{ workspacePath, scope: "files", relativePath, newRelativePath }

POST /api/workspace/flowcharts/assets/directories/move
{ workspacePath, scope, relativePath, newRelativePath }
```

两个端点均返回更新后的 `FlowChartCatalogResponse`。

### 后端新增方法

```csharp
// LightyFlowChartAssetManager
public static void MoveFile(string workspaceRootPath, LightyFlowChartAssetScope scope, 
    string relativePath, string newRelativePath)
// 使用 File.Move，自动清理空目录

// LightyFlowChartAssetManager.MoveDirectory 
// 与 RenameDirectory 逻辑相同（基于 Directory.Move），单独暴露给 move 端点
```

## 数据流

```
用户拖拽文件 → TreeView 捕获 pointer events
  → 计算 DropTarget { kind, targetKey, position }
  → FlowChartSidebar.onDrop
  → FlowChartEditorView.handleMoveFile(sourceKeys, target)
  → useFlowChartEditor.moveFlowChartFile(oldPath, newPath)
  → POST /api/.../files/move → 后端 File.Move → 返回新 catalog
  → catalog 更新 → TreeView 重新渲染
```

## 不包含的范围

- 不修改 WorkspaceSidebar（工作簿列表）
- 不修改 FlowChartCanvas（画布上的节点拖拽已有实现）
- 不做服务端文件排序持久化（排序仅前端展示用）
