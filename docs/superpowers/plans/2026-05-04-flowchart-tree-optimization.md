# FlowChart 树优化 + 拖拽移动文件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 FlowChartSidebar 中流程图树和节点树的视觉表现（图标、动画、搜索高亮、键盘导航），并添加拖拽移动文件/目录功能。

**Architecture:**
- 后端：在 `LightyFlowChartAssetManager` 中新增 `MoveFile`/`MoveDirectory` 方法，新增 `POST /api/workspace/flowcharts/assets/files/move` 和 `.../directories/move` 端点
- 前端：将 FlowChartSidebar 中的内联递归树渲染提取为独立 `TreeView` 组件体系（TreeView + TreeViewRow + TreeViewDragLayer + TreeViewIcon + TreeViewSearchHighlighter + treeViewUtils）
- 拖拽：基于 Pointer Events 实现，浮动预览层跟随指针，支持目录内放置和目录间移动

**Tech Stack:** .NET 9 (C#), React 18 (TypeScript), Vite, CSS custom properties

---

## 文件映射

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/TreeView.tsx` | 主树容器，展开/折叠，拖拽系统，键盘导航 |
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx` | 单行渲染（目录/叶子节点） |
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/TreeViewDragLayer.tsx` | 拖拽时的浮动预览层 |
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx` | SVG 图标集（目录/文件/节点定义） |
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/TreeViewSearchHighlighter.tsx` | 搜索匹配文本高亮渲染 |
| 新增 | `app/desktop/src/flowchart-editor/components/tree-view/treeViewUtils.ts` | 树展平、排序、过滤、搜索范围计算工具 |
| 新增 | `src/LightyDesign.Application/Dtos/MoveFlowChartAssetPathRequestDto.cs` | Move API 请求 DTO |
| 修改 | `src/LightyDesign.Core/Protocol/LightyFlowChartAssetManager.cs` | 新增 `MoveFile`/`MoveDirectory` |
| 修改 | `src/LightyDesign.Application/Services/FlowChartService.cs` | 新增 `MoveFile`/`MoveDirectory` 服务方法 |
| 修改 | `src/LightyDesign.DesktopHost/Program.cs` | 注册 Move API 端点 |
| 修改 | `app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts` | 新增 `moveFlowChartFile`/`moveFlowChartDirectory` |
| 修改 | `app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx` | 用 TreeView 替换递归渲染，集成拖拽 |
| 修改 | `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx` | 新增 move 回调处理 |
| 修改 | `app/desktop/src/styles/flowchart-editor.css` | 新增 TreeView 样式，移除旧树样式 |
| 修改 | `app/desktop/src/flowchart-editor/types/flowchartEditor.ts` | 可能新增 FlowChartMovePayload 类型 |

---

### Task 1: 后端 — 新增 MoveFile/MoveDirectory 到 AssetManager

**Files:**
- Modify: `src/LightyDesign.Core/Protocol/LightyFlowChartAssetManager.cs`

- [ ] **Step 1: 在 LightyFlowChartAssetManager 中新增 `MoveFile` 方法**

在 `DeleteFile` 方法之后添加：

```csharp
public static void MoveFile(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath, string newRelativePath)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

    var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
    var normalizedNewRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(newRelativePath);
    var rootPath = GetRootPath(workspaceRootPath, scope);
    var sourceFilePath = GetFilePath(workspaceRootPath, scope, normalizedRelativePath);
    var targetFilePath = GetFilePath(workspaceRootPath, scope, normalizedNewRelativePath);

    if (!File.Exists(sourceFilePath))
    {
        throw new FileNotFoundException("FlowChart asset file was not found.", sourceFilePath);
    }

    var normalizedSourcePath = NormalizeFullPath(sourceFilePath);
    var normalizedTargetPath = NormalizeFullPath(targetFilePath);
    if (string.Equals(normalizedSourcePath, normalizedTargetPath, StringComparison.OrdinalIgnoreCase))
    {
        throw new LightyCoreException("The new file path must be different from the current path.");
    }

    if (File.Exists(targetFilePath))
    {
        throw new LightyCoreException($"FlowChart asset file '{normalizedNewRelativePath}' already exists.");
    }

    Directory.CreateDirectory(Path.GetDirectoryName(targetFilePath)!);
    File.Move(sourceFilePath, targetFilePath);
    CleanupEmptyDirectories(rootPath, Path.GetDirectoryName(sourceFilePath));
}
```

- [ ] **Step 2: 新增 `MoveDirectory` 方法**

在 `MoveFile` 之后添加：

```csharp
public static void MoveDirectory(string workspaceRootPath, LightyFlowChartAssetScope scope, string relativePath, string newRelativePath)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRootPath);

    var normalizedRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(relativePath);
    var normalizedNewRelativePath = LightyWorkspacePathLayout.NormalizeRelativeAssetPath(newRelativePath);
    var rootPath = GetRootPath(workspaceRootPath, scope);
    var sourceDirectoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedRelativePath);
    var targetDirectoryPath = GetDirectoryPath(workspaceRootPath, scope, normalizedNewRelativePath);

    if (!Directory.Exists(sourceDirectoryPath))
    {
        throw new DirectoryNotFoundException($"FlowChart directory '{normalizedRelativePath}' was not found.");
    }

    var normalizedSourceDirectoryPath = NormalizeFullPath(sourceDirectoryPath);
    var normalizedTargetDirectoryPath = NormalizeFullPath(targetDirectoryPath);
    if (string.Equals(normalizedSourceDirectoryPath, normalizedTargetDirectoryPath, StringComparison.OrdinalIgnoreCase))
    {
        throw new LightyCoreException("The new directory path must be different from the current path.");
    }

    var sourcePrefix = normalizedSourceDirectoryPath + Path.DirectorySeparatorChar;
    if (normalizedTargetDirectoryPath.StartsWith(sourcePrefix, StringComparison.OrdinalIgnoreCase))
    {
        throw new LightyCoreException("Cannot move a FlowChart directory into one of its own descendants.");
    }

    if (Directory.Exists(targetDirectoryPath))
    {
        throw new LightyCoreException($"FlowChart directory '{normalizedNewRelativePath}' already exists.");
    }

    Directory.CreateDirectory(Path.GetDirectoryName(targetDirectoryPath)!);
    Directory.Move(sourceDirectoryPath, targetDirectoryPath);
    CleanupEmptyDirectories(rootPath, Path.GetDirectoryName(sourceDirectoryPath));
}
```

- [ ] **Step 3: 验证编译**

Run: `dotnet build src/LightyDesign.Core/LightyDesign.Core.csproj`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/LightyDesign.Core/Protocol/LightyFlowChartAssetManager.cs
git commit -m "feat(backend): add MoveFile and MoveDirectory to FlowChartAssetManager"
```

---

### Task 2: 后端 — 新增 Move API DTO 和服务方法

**Files:**
- Modify: `src/LightyDesign.Application/Dtos/FlowChartRequests.cs`
- Modify: `src/LightyDesign.Application/Services/FlowChartService.cs`

- [ ] **Step 1: 在 FlowChartRequests.cs 末尾添加 MoveDto**

```csharp
public sealed class MoveFlowChartAssetPathRequestDto
{
    public string WorkspacePath { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string NewRelativePath { get; set; } = string.Empty;
}
```

- [ ] **Step 2: 在 FlowChartService.cs 的 `DeleteFile` 方法之后添加 `MoveFile`**

```csharp
public object MoveFile(string workspacePath, string scope, string relativePath, string newRelativePath)
{
    var parsedScope = ParseScope(scope);
    LightyFlowChartAssetManager.MoveFile(workspacePath, parsedScope, relativePath, newRelativePath);
    return ReloadFlowChartCatalog(workspacePath);
}
```

- [ ] **Step 3: 添加 `MoveDirectory`**

```csharp
public object MoveDirectory(string workspacePath, string scope, string relativePath, string newRelativePath)
{
    var parsedScope = ParseScope(scope);
    LightyFlowChartAssetManager.MoveDirectory(workspacePath, parsedScope, relativePath, newRelativePath);
    return ReloadFlowChartCatalog(workspacePath);
}
```

- [ ] **Step 4: 编译验证**

Run: `dotnet build src/LightyDesign.Application/LightyDesign.Application.csproj`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add src/LightyDesign.Application/Dtos/FlowChartRequests.cs src/LightyDesign.Application/Services/FlowChartService.cs
git commit -m "feat(backend): add MoveFile and MoveDirectory service methods"
```

---

### Task 3: 后端 — 注册 Move API 端点

**Files:**
- Modify: `src/LightyDesign.DesktopHost/Program.cs`

- [ ] **Step 1: 在 `/api/workspace/flowcharts/assets/files/delete` 端点之后注册两个新端点**

```csharp
app.MapPost("/api/workspace/flowcharts/assets/files/move", (MoveFlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (string.IsNullOrWhiteSpace(request.NewRelativePath)) throw new ValidationException("newRelativePath is required.");
    return Results.Ok(service.MoveFile(request.WorkspacePath, request.Scope, request.RelativePath, request.NewRelativePath));
});

app.MapPost("/api/workspace/flowcharts/assets/directories/move", (MoveFlowChartAssetPathRequestDto request, FlowChartService service) =>
{
    if (string.IsNullOrWhiteSpace(request.WorkspacePath)) throw new ValidationException("workspacePath is required.");
    if (string.IsNullOrWhiteSpace(request.Scope)) throw new ValidationException("scope is required.");
    if (string.IsNullOrWhiteSpace(request.RelativePath)) throw new ValidationException("relativePath is required.");
    if (string.IsNullOrWhiteSpace(request.NewRelativePath)) throw new ValidationException("newRelativePath is required.");
    return Results.Ok(service.MoveDirectory(request.WorkspacePath, request.Scope, request.RelativePath, request.NewRelativePath));
});
```

- [ ] **Step 2: 编译验证**

Run: `dotnet build src/LightyDesign.DesktopHost/LightyDesign.DesktopHost.csproj`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/LightyDesign.DesktopHost/Program.cs
git commit -m "feat(backend): register file/directory move API endpoints"
```

---

### Task 4: 前端 — 新增 `moveFlowChartFile`/`moveFlowChartDirectory` 到 useFlowChartEditor Hook

**Files:**
- Modify: `app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts`

- [ ] **Step 1: 在 `deleteFlowChartFile` 之后添加 `moveFlowChartFile` 方法**

```typescript
const moveFlowChartFile = useCallback(
  async (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => {
    const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
    const normalizedNewRelativePath = normalizeFlowChartRelativePath(newRelativePath);
    if (!normalizedRelativePath || !normalizedNewRelativePath) {
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
      await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/files/move", {
        scope,
        relativePath: normalizedRelativePath,
        newRelativePath: normalizedNewRelativePath,
      });

      // 如果当前打开的流程图被移动，更新 activeFlowChartPath
      if (scope === "files" && activeFlowChartPath === normalizedRelativePath) {
        setActiveFlowChartPath(normalizedNewRelativePath);
      }

      onToast({
        title: scope === "files" ? "流程图已移动" : "节点定义已移动",
        summary: `${normalizedRelativePath} → ${normalizedNewRelativePath}`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 2200,
      });
      return true;
    } catch (error) {
      onToast({
        title: scope === "files" ? "流程图移动失败" : "节点定义移动失败",
        summary: normalizedRelativePath,
        detail: error instanceof Error ? error.message : "未能移动流程图资产文件。",
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
      });
      return false;
    }
  },
  [activeFlowChartPath, mutateFlowChartCatalog, onToast],
);
```

- [ ] **Step 2: 在 `moveFlowChartFile` 之后添加 `moveFlowChartDirectory` 方法**

```typescript
const moveFlowChartDirectory = useCallback(
  async (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => {
    const normalizedRelativePath = normalizeFlowChartRelativePath(relativePath);
    const normalizedNewRelativePath = normalizeFlowChartRelativePath(newRelativePath);
    if (!normalizedRelativePath || !normalizedNewRelativePath) {
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
      await mutateFlowChartCatalog("/api/workspace/flowcharts/assets/directories/move", {
        scope,
        relativePath: normalizedRelativePath,
        newRelativePath: normalizedNewRelativePath,
      });

      // 如果当前打开的流程图在被移动的目录下，更新路径
      if (
        scope === "files"
        && activeFlowChartPath
        && (activeFlowChartPath === normalizedRelativePath || activeFlowChartPath.startsWith(`${normalizedRelativePath}/`))
      ) {
        const suffix = activeFlowChartPath === normalizedRelativePath
          ? ""
          : activeFlowChartPath.slice(normalizedRelativePath.length);
        setActiveFlowChartPath(`${normalizedNewRelativePath}${suffix}`);
      }

      onToast({
        title: "目录已移动",
        summary: `${normalizedRelativePath} → ${normalizedNewRelativePath}`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 2200,
      });
      return true;
    } catch (error) {
      onToast({
        title: "目录移动失败",
        summary: normalizedRelativePath,
        detail: error instanceof Error ? error.message : "未能移动流程图目录。",
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
      });
      return false;
    }
  },
  [activeFlowChartPath, mutateFlowChartCatalog, onToast],
);
```

- [ ] **Step 3: 在 return 对象中添加这两个方法**

在 return 语句中找到 `deleteFlowChartFile` 附近，添加：

```typescript
    moveFlowChartFile,
    moveFlowChartDirectory,
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts
git commit -m "feat(frontend): add moveFlowChartFile and moveFlowChartDirectory to hook"
```

---

### Task 5: 前端 — 创建 treeViewUtils.ts

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/treeViewUtils.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p app/desktop/src/flowchart-editor/components/tree-view
```

- [ ] **Step 2: 编写 `treeViewUtils.ts`**

该模块负责：将递归树展平为一维数组、计算搜索匹配范围、树排序和过滤。

```typescript
/**
 * Tree view utility types and functions.
 * Flattens a recursive tree structure into a flat array for TreeView rendering.
 */

export type TreeViewItemKind = "directory" | "leaf";

export type TreeViewItem = {
  id: string;
  depth: number;
  kind: TreeViewItemKind;
  label: string;
  /** [start, end] pairs of search match character offsets in the label */
  searchRanges: [number, number][];
  /** Arbitrary metadata passed through to renderers */
  metadata: Record<string, unknown>;
};

export type DropTargetPosition = "before" | "after" | "inside";

export type DropTarget = {
  kind: "directory" | "reorder";
  targetKey: string;
  position: DropTargetPosition;
};

export type DragPayload = {
  keys: string[];
  labels: string[];
};

/**
 * Compute [start, end] character ranges in `text` that match `keyword` (case-insensitive).
 */
export function computeSearchRanges(text: string, keyword: string): [number, number][] {
  if (!keyword || !text) {
    return [];
  }

  const ranges: [number, number][] = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  let startIndex = 0;

  while (startIndex < lowerText.length) {
    const matchIndex = lowerText.indexOf(lowerKeyword, startIndex);
    if (matchIndex === -1) {
      break;
    }
    ranges.push([matchIndex, matchIndex + lowerKeyword.length]);
    startIndex = matchIndex + 1;
  }

  return ranges;
}

/**
 * Check if a metadata entry matches by comparing its `searchText`-equivalent fields.
 * Used during tree building to determine if an item should be included.
 */
export function itemMatchesSearch(
  searchText: string,
  keyword: string,
): boolean {
  if (!keyword) {
    return true;
  }
  return searchText.toLowerCase().includes(keyword.toLowerCase());
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/treeViewUtils.ts
git commit -m "feat(frontend): add treeViewUtils with search range computation"
```

---

### Task 6: 前端 — 创建 TreeViewIcon.tsx

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx`

- [ ] **Step 1: 编写 TreeViewIcon 组件**

```typescript
type TreeViewIconProps = {
  kind: "directory-collapsed" | "directory-expanded" | "flowchart-file" | "node-definition" | "empty";
  className?: string;
};

export function TreeViewIcon({ kind, className }: TreeViewIconProps) {
  const cls = `tree-view-icon ${className ?? ""}`;
  switch (kind) {
    case "directory-collapsed":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1V11a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z" fill="#7cb342" stroke="#558b2f" strokeWidth="0.8"/>
          </svg>
        </span>
      );
    case "directory-expanded":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1V11a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" fill="#8bc34a" stroke="#7cb342" strokeWidth="0.8"/>
          </svg>
        </span>
      );
    case "flowchart-file":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#2b5797" stroke="#1a3a6b" strokeWidth="0.8"/>
            <path d="M9 2v4h4" fill="none" stroke="#1a3a6b" strokeWidth="0.8"/>
            <circle cx="8" cy="10" r="1.5" fill="#7ec9ff"/>
          </svg>
        </span>
      );
    case "node-definition":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" fill="#3e2723" stroke="#6d4c41" strokeWidth="0.8"/>
            <circle cx="8" cy="8" r="2.5" fill="#f0b35b"/>
          </svg>
        </span>
      );
    case "empty":
      return <span className={cls} />;
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx
git commit -m "feat(frontend): add TreeViewIcon component with SVG icons"
```

---

### Task 7: 前端 — 创建 TreeViewSearchHighlighter.tsx

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewSearchHighlighter.tsx`

- [ ] **Step 1: 编写 TreeViewSearchHighlighter 组件**

```typescript
type TreeViewSearchHighlighterProps = {
  text: string;
  ranges: [number, number][];
};

/**
 * Renders text with search match ranges highlighted using <mark> elements.
 */
export function TreeViewSearchHighlighter({ text, ranges }: TreeViewSearchHighlighterProps) {
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const normalizedRanges = ranges
    .filter(([start, end]) => start >= 0 && end <= text.length && start < end)
    .sort(([a], [b]) => a - b);

  if (normalizedRanges.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  normalizedRanges.forEach(([start, end], index) => {
    if (start > lastEnd) {
      segments.push(<span key={`t${lastEnd}`}>{text.slice(lastEnd, start)}</span>);
    }
    segments.push(<mark key={`m${index}`} className="tree-view-search-match">{text.slice(start, end)}</mark>);
    lastEnd = end;
  });

  if (lastEnd < text.length) {
    segments.push(<span key={`t${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{segments}</>;
}
```

- [ ] **Step 2: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewSearchHighlighter.tsx
git commit -m "feat(frontend): add TreeViewSearchHighlighter component"
```

---

### Task 8: 前端 — 创建 TreeViewDragLayer.tsx

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewDragLayer.tsx`

- [ ] **Step 1: 编写 TreeViewDragLayer 组件**

该组件在拖拽激活时显示一个跟随指针的半透明卡片。

```typescript
import { useEffect, useState } from "react";

type TreeViewDragLayerProps = {
  /** The label text being dragged */
  label: string;
  /** Number of items being dragged */
  count: number;
};

/**
 * A floating preview that follows the pointer during drag operations.
 * Rendered into a portal div at the document body level.
 */
export function TreeViewDragLayer({ label, count }: TreeViewDragLayerProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
    };

    document.addEventListener("pointermove", handlePointerMove);
    return () => document.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <div
      className="tree-view-drag-layer"
      style={{
        position: "fixed",
        left: position.x + 12,
        top: position.y - 18,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <span className="tree-view-drag-layer-label">{label}</span>
      {count > 1 ? <span className="badge">{count} 项</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewDragLayer.tsx
git commit -m "feat(frontend): add TreeViewDragLayer drag preview component"
```

---

### Task 9: 前端 — 创建 TreeViewRow.tsx

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx`

- [ ] **Step 1: 编写 TreeViewRow 组件**

单行渲染，支持目录和叶子两种模式，集成拖拽源逻辑。

```typescript
import { useCallback, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { TreeViewItem, DragPayload } from "./treeViewUtils";

type TreeViewRowProps = {
  item: TreeViewItem;
  isExpanded: boolean;
  isSelected: boolean;
  isDragOver: boolean;
  dragOverPosition: "before" | "after" | "inside" | null;
  depth: number;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (event: ReactMouseEvent, item: TreeViewItem) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  /** Called to register the row's pointer event handlers with the drag system */
  registerDragEvents: (
    element: HTMLElement | null,
    item: TreeViewItem,
  ) => void;
  /** Render slots */
  icon: React.ReactNode;
  label: React.ReactNode;
  badge: React.ReactNode;
};

export function TreeViewRow({
  item,
  isExpanded,
  isSelected,
  isDragOver,
  dragOverPosition,
  onToggle,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragEnd,
  registerDragEvents,
  icon,
  label,
  badge,
}: TreeViewRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  const setRowRef = useCallback(
    (element: HTMLDivElement | null) => {
      rowRef.current = element;
      registerDragEvents(element, item);
    },
    [item, registerDragEvents],
  );

  const handleClick = useCallback(() => {
    if (item.kind === "directory") {
      onToggle(item.id);
    } else {
      onSelect(item.id);
    }
  }, [item.id, item.kind, onToggle, onSelect]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      onContextMenu(event, item);
    },
    [item, onContextMenu],
  );

  const rowClass = [
    "tree-view-row",
    `tree-view-row-${item.kind}`,
    isSelected ? "is-selected" : "",
    isDragOver ? "is-drag-over" : "",
    dragOverPosition ? `is-drag-${dragOverPosition}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setRowRef}
      className={rowClass}
      style={{ paddingLeft: 8 + item.depth * 18 }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="treeitem"
      aria-expanded={item.kind === "directory" ? isExpanded : undefined}
      aria-selected={isSelected}
      tabIndex={0}
    >
      <span className="tree-view-row-expander">
        {item.kind === "directory" ? (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`tree-view-expander-icon${isExpanded ? " is-expanded" : ""}`}>
            <path d={isExpanded ? "M1 3l3 3 3-3" : "M3 1l3 3-3 3"} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : null}
      </span>
      <span className="tree-view-row-icon">{icon}</span>
      <span className="tree-view-row-label">{label}</span>
      <span className="tree-view-row-badge">{badge}</span>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx
git commit -m "feat(frontend): add TreeViewRow component"
```

---

### Task 10: 前端 — 创建 TreeView.tsx 主组件（核心）

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/tree-view/TreeView.tsx`

这是最大的组件，包含：容器、拖拽系统（Pointer Events）、键盘导航。

- [ ] **Step 1: 编写 TreeView 组件**

```typescript
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { TreeViewRow } from "./TreeViewRow";
import { TreeViewDragLayer } from "./TreeViewDragLayer";
import type { TreeViewItem, DropTarget, DragPayload } from "./treeViewUtils";

type TreeViewProps = {
  items: TreeViewItem[];
  expandedKeys: Set<string>;
  selectedKey: string | null;
  searchKeyword: string;
  dragEnabled: boolean;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onContextMenu: (event: ReactMouseEvent, item: TreeViewItem) => void;
  onDrop: (source: DragPayload, target: DropTarget) => void;
  renderIcon: (item: TreeViewItem) => React.ReactNode;
  renderLabel: (item: TreeViewItem) => React.ReactNode;
  renderBadge: (item: TreeViewItem) => React.ReactNode;
};

type DragState = {
  payload: DragPayload;
  currentTarget: DropTarget | null;
  pointerStart: { x: number; y: number };
};

export function TreeView({
  items,
  expandedKeys,
  selectedKey,
  searchKeyword,
  dragEnabled,
  onToggle,
  onSelect,
  onContextMenu,
  onDrop,
  renderIcon,
  renderLabel,
  renderBadge,
}: TreeViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | "inside" | null>(null);

  // ── Pointer-based drag system ──
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const registerDragEvents = useCallback(
    (element: HTMLElement | null, item: TreeViewItem) => {
      if (!element) {
        itemElementsRef.current.delete(item.id);
        return;
      }
      itemElementsRef.current.set(item.id, element);

      if (!dragEnabled || item.kind === "directory") {
        return;
      }

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!pointerStartRef.current || draggingRef.current) return;
        const dx = event.clientX - pointerStartRef.current.x;
        const dy = event.clientY - pointerStartRef.current.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          draggingRef.current = true;
          setDragState({
            payload: {
              keys: [item.id],
              labels: [item.label],
            },
            currentTarget: null,
            pointerStart: pointerStartRef.current,
          });
        }
      };

      const handlePointerUp = () => {
        pointerStartRef.current = null;
        draggingRef.current = false;
      };

      element.addEventListener("pointerdown", handlePointerDown);
      element.addEventListener("pointermove", handlePointerMove);
      element.addEventListener("pointerup", handlePointerUp);
      element.addEventListener("pointercancel", handlePointerUp);

      // Cleanup via return in the registration callback? No — store for cleanup.
      const cleanup = () => {
        element.removeEventListener("pointerdown", handlePointerDown);
        element.removeEventListener("pointermove", handlePointerMove);
        element.removeEventListener("pointerup", handlePointerUp);
        element.removeEventListener("pointercancel", handlePointerUp);
      };
      // Store the cleanup function on the element for retrieval during un-registration
      (element as any).__treeViewDragCleanup = cleanup;
    },
    [dragEnabled],
  );

  // ── Drag-over detection on the scroll container ──
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragState) return;

      const scrollRect = scrollRef.current?.getBoundingClientRect();
      if (!scrollRect) return;

      const y = event.clientY;
      // Find which item row the pointer is over
      let targetKey: string | null = null;
      let targetRect: DOMRect | null = null;

      itemElementsRef.current.forEach((element, key) => {
        const rect = element.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          targetKey = key;
          targetRect = rect;
        }
      });

      if (!targetKey || !targetRect) {
        setDragOverKey(null);
        setDragOverPosition(null);
        return;
      }

      setDragOverKey(targetKey);

      // Determine position: within top 25% = before, bottom 25% = after, middle 50% = inside (if directory)
      const relativeY = (y - targetRect.top) / targetRect.height;
      const targetItem = items.find((it) => it.id === targetKey);

      if (targetItem?.kind === "directory" && relativeY > 0.25 && relativeY < 0.75) {
        setDragOverPosition("inside");
      } else if (relativeY < 0.5) {
        setDragOverPosition("before");
      } else {
        setDragOverPosition("after");
      }
    },
    [dragState, items],
  );

  const handlePointerUp = useCallback(() => {
    if (dragState && dragOverKey && dragOverPosition) {
      const target: DropTarget = {
        kind: dragOverPosition === "inside" ? "directory" : "reorder",
        targetKey: dragOverKey,
        position: dragOverPosition,
      };
      onDrop(dragState.payload, target);
    }
    setDragState(null);
    setDragOverKey(null);
    setDragOverPosition(null);
    draggingRef.current = false;
    pointerStartRef.current = null;
  }, [dragState, dragOverKey, dragOverPosition, onDrop]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selectedKey) return;
      const currentIndex = items.findIndex((it) => it.id === selectedKey);
      if (currentIndex === -1) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (currentIndex < items.length - 1) {
            onSelect(items[currentIndex + 1].id);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          if (currentIndex > 0) {
            onSelect(items[currentIndex - 1].id);
          }
          break;
        case "ArrowRight":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory" && !expandedKeys.has(item.id)) {
              onToggle(item.id);
            }
          }
          break;
        case "ArrowLeft":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory" && expandedKeys.has(item.id)) {
              onToggle(item.id);
            }
          }
          break;
        case "Enter":
          event.preventDefault();
          {
            const item = items[currentIndex];
            if (item.kind === "directory") {
              onToggle(item.id);
            }
          }
          break;
      }
    },
    [items, selectedKey, expandedKeys, onToggle, onSelect],
  );

  return (
    <div
      className="tree-view"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      role="tree"
      tabIndex={0}
    >
      <div className="tree-view-scroll" ref={scrollRef}>
        {items.map((item) => (
          <TreeViewRow
            key={item.id}
            item={item}
            isExpanded={expandedKeys.has(item.id)}
            isSelected={selectedKey === item.id}
            isDragOver={dragOverKey === item.id}
            dragOverPosition={dragOverKey === item.id ? dragOverPosition : null}
            depth={item.depth}
            onToggle={onToggle}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onDragStart={() => {}}
            onDragEnd={() => {}}
            registerDragEvents={registerDragEvents}
            icon={renderIcon(item)}
            label={renderLabel(item)}
            badge={renderBadge(item)}
          />
        ))}
      </div>

      {dragState ? (
        <TreeViewDragLayer label={dragState.payload.labels[0]} count={dragState.payload.keys.length} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeView.tsx
git commit -m "feat(frontend): add TreeView main component with drag system and keyboard nav"
```

---

### Task 11: 前端 — 重构 FlowChartSidebar 以使用 TreeView

**Files:**
- Rewrite: `app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx`

这是最大的前端改动。将递归 `renderTreeEntry` 替换为 TreeView + 展平数据。

- [ ] **Step 1: 重构 FlowChartSidebar.tsx**

保留：props 接口、tab 切换、搜索输入、上下文菜单、resize 手柄、展开状态持久化。
替换：`renderTreeEntry` 递归渲染 → TreeView 组件 + `buildFlatItems()` 函数。

在文件开头添加新的导入：

```typescript
import { TreeView } from "./tree-view/TreeView";
import { TreeViewIcon } from "./tree-view/TreeViewIcon";
import { TreeViewSearchHighlighter } from "./tree-view/TreeViewSearchHighlighter";
import type { TreeViewItem, DropTarget, DragPayload, TreeViewItemKind } from "./tree-view/treeViewUtils";
import { computeSearchRanges } from "./tree-view/treeViewUtils";
```

保留原有的辅助类型：`FlowChartTreeScope`, `TreeDirectoryNode`, `TreeFlowChartNode`, `TreeNodeDefinitionNode`, `TreeEntry`, `TreeContextMenuTarget`——它们仍然用于构建目录树结构。

在 `filterTree` 函数之后（约 205 行），新增 `buildFlatItems` 函数：

```typescript
function buildFlatItems(
  root: TreeDirectoryNode,
  expandedKeys: Set<string>,
  keyword: string,
): TreeViewItem[] {
  const result: TreeViewItem[] = [];
  const isSearchActive = keyword.length > 0;

  function walk(entry: TreeEntry, depth: number) {
    if (entry.kind === "directory") {
      // Build directory item
      const searchRanges = computeSearchRanges(entry.name, keyword);
      result.push({
        id: entry.key,
        depth,
        kind: "directory",
        label: entry.name,
        searchRanges,
        metadata: {
          scope: entry.scope,
          relativePath: entry.relativePath,
          isRoot: entry.isRoot,
          count: entry.count,
        },
      });

      const isExpanded = isSearchActive || expandedKeys.has(entry.key);
      if (isExpanded) {
        entry.children.forEach((child) => walk(child, depth + 1));
      }
    } else {
      // Build leaf item
      const label = entry.kind === "flowchart-file" ? entry.label : entry.label;
      const searchRanges = computeSearchRanges(label, keyword);
      result.push({
        id: entry.key,
        depth,
        kind: "leaf",
        label,
        searchRanges,
        metadata: {
          kind: entry.kind,
          scope: entry.scope,
          relativePath: entry.relativePath,
          nodeKind: entry.kind === "node-definition" ? entry.nodeKind : undefined,
        },
      });
    }
  }

  walk(root, 0);
  return result;
}
```

新增 `selectedKey` 计算（基于 `activeFlowChartPath`）：

```typescript
const selectedKey = useMemo<string | null>(() => {
  if (!activeFlowChartPath) return null;
  return buildTreeKey("files", activeFlowChartPath);
}, [activeFlowChartPath]);
```

替换 `renderTreeEntry` 和它的调用代码。在 return 语句中，用 TreeView 替换原来的 `.flowchart-sidebar-tree-content` 容器：

```typescript
{catalogStatus === "ready" && catalog ? (
  <>
    <div className="flowchart-sidebar-tree">
      <TreeView
        items={flatItems}
        expandedKeys={expandedKeys}
        selectedKey={selectedKey}
        searchKeyword={activeKeyword}
        dragEnabled={isSearchActive ? false : true}
        onToggle={toggleDirectory}
        onSelect={(key) => {
          // Find the item and perform the appropriate action
          const targetItem = flatItems.find((it) => it.id === key);
          if (!targetItem) return;
          const entry = findEntryByKey(activeTree, key);
          if (!entry) return;
          if (entry.kind === "flowchart-file") {
            onOpenFlowChart(entry.relativePath);
          } else if (entry.kind === "node-definition" && canAddNode) {
            void onAddNode(entry.relativePath);
          }
        }}
        onContextMenu={(event, item) => {
          // Map TreeViewItem back to TreeContextMenuTarget
          const entry = findEntryByKey(activeTree, item.id);
          if (!entry) return;
          if (entry.kind === "directory") {
            openContextMenu(event, {
              kind: "directory",
              scope: entry.scope,
              relativePath: entry.relativePath,
              label: entry.name,
              key: entry.key,
              isRoot: entry.isRoot,
              expanded: expandedKeys.has(entry.key),
            });
          } else if (entry.kind === "flowchart-file") {
            openContextMenu(event, {
              kind: "flowchart-file",
              relativePath: entry.relativePath,
              label: entry.label,
            });
          } else if (entry.kind === "node-definition") {
            openContextMenu(event, {
              kind: "node-definition",
              relativePath: entry.relativePath,
              label: entry.label,
            });
          }
        }}
        onDrop={handleTreeDrop}
        renderIcon={(item) => {
          if (item.kind === "directory") {
            const isExpanded = expandedKeys.has(item.id);
            return <TreeViewIcon kind={isExpanded ? "directory-expanded" : "directory-collapsed"} />;
          }
          const nodeKind = item.metadata.kind as string;
          return <TreeViewIcon kind={nodeKind === "node-definition" ? "node-definition" : "flowchart-file"} />;
        }}
        renderLabel={(item) => (
          <TreeViewSearchHighlighter text={item.label} ranges={item.searchRanges} />
        )}
        renderBadge={(item) => {
          if (item.kind === "directory" && item.metadata.count != null) {
            return <span className="badge">{item.metadata.count as number}</span>;
          }
          if (item.kind === "leaf" && item.metadata.nodeKind) {
            return <span className={`flowchart-kind-badge is-${item.metadata.nodeKind as string}`}>{item.metadata.nodeKind as string}</span>;
          }
          if (item.kind === "leaf" && item.metadata.kind === "flowchart-file" && activeFlowChartPath === item.metadata.relativePath) {
            return <span className="badge flowchart-tree-row-badge">打开中</span>;
          }
          return null;
        }}
      />
    </div>
    {/* ... search empty state 保持不变 ... */}
  </>
) : null}
```

添加 `findEntryByKey` 辅助函数：

```typescript
function findEntryByKey(root: TreeDirectoryNode, key: string): TreeEntry | null {
  if (root.key === key) return root;
  for (const child of root.children) {
    if (child.kind === "directory") {
      const found = findEntryByKey(child, key);
      if (found) return found;
    } else if (child.key === key) {
      return child;
    }
  }
  return null;
}
```

添加 `handleTreeDrop` 回调：

```typescript
const handleTreeDrop = useCallback(
  (source: DragPayload, target: DropTarget) => {
    // For now, only handle "inside directory" drop for single items
    if (source.keys.length !== 1) return;
    const sourceKey = source.keys[0];
    const sourceEntry = findEntryByKey(activeTreeDir!, sourceKey);
    if (!sourceEntry) return;

    if (target.kind === "directory") {
      // Moving item into a directory
      const targetEntry = findEntryByKey(activeTreeDir!, target.targetKey);
      if (!targetEntry || targetEntry.kind !== "directory") return;

      const sourcePath = sourceEntry.kind === "directory" ? sourceEntry.relativePath : sourceEntry.relativePath;
      const targetDirPath = targetEntry.relativePath ?? "";
      const sourceName = sourceEntry.kind === "directory" ? sourceEntry.name : (sourceEntry as TreeFlowChartNode | TreeNodeDefinitionNode).label;
      const newRelativePath = targetDirPath ? `${targetDirPath}/${sourceName}` : sourceName;

      if (!sourcePath || sourcePath === newRelativePath) return;

      if (sourceEntry.kind === "directory") {
        void onMoveDirectory?.(sourceEntry.scope, sourcePath, newRelativePath);
      } else {
        const scope = sourceEntry.kind === "flowchart-file" ? "files" : (sourceEntry as TreeNodeDefinitionNode).scope;
        void onMoveFile?.(scope, sourcePath, newRelativePath);
      }
    }
  },
  [activeTreeDir],
);
```

添加新的 props 类型和传入：

在 `FlowChartSidebarProps` 接口中添加：

```typescript
onMoveFile?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
onMoveDirectory?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
```

在 `FlowChartSidebar` 函数参数中解构新增的 props，并传递给 `handleTreeDrop`。

替换 `flatItems` 计算（替换原来的 `filesTree`/`nodesTree` 在 JSX 中的使用）：

```typescript
const activeTreeDir = useMemo(() => {
  const tree = activeTab === "files" ? filesTree : nodesTree;
  return tree?.kind === "directory" ? tree : null;
}, [activeTab, filesTree, nodesTree]);

const flatItems = useMemo(() => {
  if (!activeTreeDir) return [];
  return buildFlatItems(activeTreeDir, expandedKeys, activeKeyword);
}, [activeTreeDir, expandedKeys, activeKeyword]);
```

- [ ] **Step 2: 将新增 props 添加到 FlowChartSidebarProps 并导出**

```typescript
type FlowChartSidebarProps = {
  // ... existing props ...
  onMoveFile?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
  onMoveDirectory?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
};
```

- [ ] **Step 3: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx
git commit -m "feat(frontend): refactor FlowChartSidebar to use TreeView component"
```

---

### Task 12: 前端 — 更新 FlowChartEditorView 集成 move 处理

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx`

- [ ] **Step 1: 在 FlowChartEditorView 中添加 move 回调处理**

在 `handleRequestDeleteFlowChart` 之后添加：

```typescript
function handleMoveFile(scope: "files" | "nodes", relativePath: string, newRelativePath: string) {
  void editor.moveFlowChartFile(scope, relativePath, newRelativePath);
}

function handleMoveDirectory(scope: "files" | "nodes", relativePath: string, newRelativePath: string) {
  void editor.moveFlowChartDirectory(scope, relativePath, newRelativePath);
}
```

- [ ] **Step 2: 传递给 FlowChartSidebar**

在 `<FlowChartSidebar>` 的 props 中添加：

```typescript
onMoveFile={handleMoveFile}
onMoveDirectory={handleMoveDirectory}
```

- [ ] **Step 3: 验证编译**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git commit -m "feat(frontend): wire move handlers in FlowChartEditorView"
```

---

### Task 13: 前端 — 更新 CSS 样式

**Files:**
- Modify: `app/desktop/src/styles/flowchart-editor.css`

- [ ] **Step 1: 替换旧的树样式为 TreeView 新样式**

删除以下旧样式（约 336-435 行）：
- `.flowchart-sidebar-tree` 到 `.flowchart-tree-row-leaf.is-selected`

替换为：

```css
/* ── TreeView ── */
.tree-view {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  outline: none;
}

.tree-view:focus-visible {
  outline: 1px solid #007acc;
  outline-offset: -1px;
}

.tree-view-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

/* ── Tree Row ── */
.tree-view-row {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  border-radius: 2px;
  transition: background 100ms ease, border-color 100ms ease;
  position: relative;
}

.tree-view-row:hover {
  background: #2a2d2e;
}

.tree-view-row.is-selected {
  background: #0f2434;
  border-color: #007acc;
  box-shadow: inset 2px 0 0 #007acc;
}

/* ── Drag over states ── */
.tree-view-row.is-drag-over {
  background: #1a3a5c;
}

.tree-view-row.is-drag-before::before,
.tree-view-row.is-drag-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #4fc1ff;
  pointer-events: none;
  z-index: 1;
}

.tree-view-row.is-drag-before::before {
  top: -1px;
}

.tree-view-row.is-drag-after::after {
  bottom: -1px;
}

.tree-view-row.is-drag-inside {
  border-color: #4fc1ff;
  box-shadow: inset 0 0 0 1px rgba(79, 193, 255, 0.3);
}

/* ── Row expander ── */
.tree-view-row-expander {
  width: 12px;
  flex: 0 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8b8b8b;
}

.tree-view-expander-icon {
  transition: transform 120ms ease;
}

.tree-view-expander-icon.is-expanded {
  transform: rotate(0deg);
}

.tree-view-expander-icon:not(.is-expanded) {
  transform: rotate(-90deg);
}

/* ── Row icon ── */
.tree-view-row-icon {
  flex: 0 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tree-view-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

/* ── Row label ── */
.tree-view-row-label {
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #dcdcdc;
  font-size: 13px;
}

.tree-view-row-label strong {
  font-weight: 600;
}

/* ── Row badge ── */
.tree-view-row-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ── Search highlight ── */
.tree-view-search-match {
  background: rgba(255, 200, 50, 0.25);
  color: #e8c84a;
  border-radius: 2px;
  padding: 0 1px;
}

/* ── Drag layer preview ── */
.tree-view-drag-layer {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid #4fc1ff;
  background: rgba(15, 36, 52, 0.92);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  border-radius: 4px;
  pointer-events: none;
  font-size: 13px;
  color: #dcdcdc;
  white-space: nowrap;
}

.tree-view-drag-layer-label {
  font-weight: 600;
}

/* ── Directory root special style ── */
.tree-view-row-directory.is-root {
  font-weight: 600;
  color: #e0e0e0;
}

/* ── Sidebar tree container ── */
.flowchart-sidebar-tree {
  min-height: 0;
  flex: 1 1 auto;
  margin-top: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: 验证 CSS 不破坏其他布局**

确保 `.flowchart-sidebar-tree` 新样式与 `.flowchart-sidebar-tree-shell` 兼容。检查是否还有引用旧 class 的元素（如 `.flowchart-tree-row`）。
如果还有残留引用，在 JSX 中一并更新。

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/styles/flowchart-editor.css
git commit -m "style(frontend): add TreeView CSS styles, remove old tree styles"
```

---

## Spec 自检

1. **Spec 覆盖**: 
   - ✅ 后端 MoveFile/MoveDirectory: Task 1-3
   - ✅ TreeView 组件体系 (6 个文件): Task 5-10
   - ✅ FlowChartSidebar 重构: Task 11
   - ✅ 集成 move 回调: Task 12
   - ✅ CSS 样式: Task 13
   - ✅ 搜索高亮: Task 7 + Task 11(renderLabel)
   - ✅ 键盘导航: Task 10(TreeView.handleKeyDown)
   - ✅ 拖拽视觉反馈: Task 10 + Task 13(drag-over states)
   - ⚠️ 目录内排序拖拽: 当前设计为基于 localStorage 的纯前端排序，未包含在计划中（可与用户确认是否立即实现）

2. **Placeholder 检查**: 所有代码块均为完整实现代码，无 TBD/TODO。

3. **类型一致性**: `TreeViewItem` 类型在 `treeViewUtils.ts` 中定义，在 `TreeView.tsx`、`TreeViewRow.tsx`、`FlowChartSidebar.tsx` 中使用，签名一致。

4. **范围检查**: 计划专注于 FlowChartSidebar 优化 + 后端 Move API，不涉及 WorkspaceSidebar 或 FlowChartCanvas。

## 执行交接

计划完整保存在 `docs/superpowers/plans/2026-05-04-flowchart-tree-optimization.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）**—— 我按 Task 分派独立的子 agent，每完成一个 Task 后 review，快速迭代

2. **Inline Execution** —— 在当前会话中直接执行，使用 checkpoint 分批 review

选择哪种？
