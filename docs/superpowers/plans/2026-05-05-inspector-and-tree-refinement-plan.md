# Inspector & Tree Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the flowchart editor inspector from a floating overlay into a fixed right-side panel, redesign tree view icons/styles, and add batch property editing.

**Architecture:** Convert workspace-main layout from two-column (sidebar + canvas) to three-column (sidebar + canvas + inspector panel). Create `FlowChartInspectorPanel` component replacing both `FlowChartFloatingInspector` and `FlowChartInspector`. Redesign `TreeViewIcon` SVGs to B&W + blue accent scheme. Add HTML5 drag from tree to canvas for node creation.

**Tech Stack:** React 19, TypeScript 5.9, CSS Grid, SVG

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `app/desktop/src/flowchart-editor/components/FlowChartInspectorPanel.tsx` | Right-side fixed inspector panel with empty/single/batch modes |

### Modified files
| File | What changes |
|------|-------------|
| `app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx` | All SVGs redesigned to B&W+blue accent style with type-colored node-def icons |
| `app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx` | Enlarge expander arrow to 12×12, add HTML5 drag for node-definitions |
| `app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx` | Node click opens definition editor instead of add-dialog |
| `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx` | Three-column grid layout; remove floating inspector; pass new props |
| `app/desktop/src/flowchart-editor/components/FlowChartCanvas.tsx` | Add `onDropNodeDefinition` prop and drop event handler |
| `app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts` | Add `batchUpdateNodePropertyValue` method |
| `app/desktop/src/styles/flowchart-editor.css` | New styles for inspector panel, compact property fields, batch mode, tree rows |

### Deleted files
| File | Why |
|------|-----|
| `app/desktop/src/flowchart-editor/components/FlowChartFloatingInspector.tsx` | Replaced by FlowChartInspectorPanel |
| `app/desktop/src/flowchart-editor/components/FlowChartInspector.tsx` | Functionality migrated to FlowChartInspectorPanel |

---

### Task 1: Redesign TreeViewIcon SVGs

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx` (entire file)

- [ ] **Step 1: Update the `TreeViewIconProps` type to split node-definition into three kinds**

```typescript
type TreeViewIconProps = {
  kind: "directory-collapsed" | "directory-expanded" | "flowchart-file" | "node-definition-event" | "node-definition-flow" | "node-definition-compute" | "empty";
  className?: string;
};
```

- [ ] **Step 2: Replace each SVG case statement**

Replace `directory-collapsed` — folder outline in gray `currentColor`:
```tsx
case "directory-collapsed":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 5.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V5.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </svg>
    </span>
  );
```

Replace `directory-expanded` — open folder outline:
```tsx
case "directory-expanded":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 6a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M2 10h14" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </svg>
    </span>
  );
```

Replace `flowchart-file` — document outline:
```tsx
case "flowchart-file":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4 2h7l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M11 2v4h4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </svg>
    </span>
  );
```

Replace `node-definition` — split into three type-colored variants:
```tsx
case "node-definition-event":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" stroke="#4fc1ff" strokeWidth="1.2" fill="none"/>
        <text x="9" y="13" textAnchor="middle" fill="#4fc1ff" fontSize="11" fontWeight="600" fontFamily="inherit">E</text>
      </svg>
    </span>
  );
case "node-definition-flow":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" stroke="#72d08d" strokeWidth="1.2" fill="none"/>
        <text x="9" y="13" textAnchor="middle" fill="#72d08d" fontSize="11" fontWeight="600" fontFamily="inherit">F</text>
      </svg>
    </span>
  );
case "node-definition-compute":
  return (
    <span className={cls}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3" stroke="#f0b35b" strokeWidth="1.2" fill="none"/>
        <text x="9" y="13" textAnchor="middle" fill="#f0b35b" fontSize="11" fontWeight="600" fontFamily="inherit">C</text>
      </svg>
    </span>
  );
```

Keep `empty` case unchanged.

- [ ] **Step 3: Update the renderIcon callback in FlowChartSidebar.tsx**

At lines ~719-726, change the `renderIcon` prop to pass node-kind-specific icon types:

```typescript
renderIcon={(item) => {
  if (item.kind === "directory") {
    const isExpanded = expandedKeys.has(item.id);
    return <TreeViewIcon kind={isExpanded ? "directory-expanded" : "directory-collapsed"} />;
  }
  const entryKind = item.metadata.kind as string;
  if (entryKind === "node-definition") {
    const nodeKind = item.metadata.nodeKind as string;
    if (nodeKind === "event") return <TreeViewIcon kind="node-definition-event" />;
    if (nodeKind === "flow") return <TreeViewIcon kind="node-definition-flow" />;
    if (nodeKind === "compute") return <TreeViewIcon kind="node-definition-compute" />;
  }
  return <TreeViewIcon kind="flowchart-file" />;
}}
```

- [ ] **Step 4: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors. If type errors occur for unused `"node-definition"` in the union, remove it from the type.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewIcon.tsx app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx
git commit -m "feat: redesign TreeViewIcon SVGs to B&W + type-colored node-def icons"
```

---

### Task 2: Fix TreeViewRow expander arrow and add drag support

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx`

- [ ] **Step 1: Enlarge expander arrow to 12×12 with thicker stroke**

In `TreeViewRow.tsx`, find the expander SVG (around line 85). Change from 8×8 to 12×12:

```tsx
<span className="tree-view-row-expander">
  {item.kind === "directory" ? (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`tree-view-expander-icon${isExpanded ? " is-expanded" : ""}`}>
      <path d={isExpanded ? "M2 4l4 4 4-4" : "M4 2l4 4-4 4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : null}
</span>
```

- [ ] **Step 2: Add draggable attribute and onDragStart for node-definition items**

After the existing `handleContextMenu` callback, add:

```typescript
const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
  if (item.kind === "directory") return;
  const entryKind = item.metadata.kind as string;
  if (entryKind === "node-definition") {
    event.dataTransfer.setData("text/plain", item.metadata.relativePath as string);
    event.dataTransfer.effectAllowed = "copy";
  }
}, [item]);
```

Add `draggable` and `onDragStart` to the row div:

```tsx
<div
  ref={setRowRef}
  className={rowClass}
  style={{ paddingLeft: 8 + item.depth * 18 }}
  onClick={handleClick}
  onContextMenu={handleContextMenu}
  draggable={item.kind === "leaf" && (item.metadata.kind as string) === "node-definition"}
  onDragStart={handleDragStart}
  role="treeitem"
  aria-expanded={item.kind === "directory" ? isExpanded : undefined}
  aria-selected={isSelected}
  tabIndex={0}
>
```

- [ ] **Step 3: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/tree-view/TreeViewRow.tsx
git commit -m "feat: enlarge expander arrow to 12x12, add HTML5 drag for node-definitions"
```

---

### Task 3: Update tree row CSS styles

**Files:**
- Modify: `app/desktop/src/styles/flowchart-editor.css`

- [ ] **Step 1: Append new tree-view-row CSS rules**

At the end of `flowchart-editor.css`, add:

```css
/* ── Tree View Row Styles ── */
.tree-view-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding-right: 8px;
  border-radius: 2px;
  cursor: pointer;
  color: #cccccc;
  user-select: none;
  white-space: nowrap;
}

.tree-view-row:hover {
  background: #2a2a2a;
}

.tree-view-row.is-selected {
  background: #0f2434;
  box-shadow: inset 2px 0 0 #007acc;
}

.tree-view-row-directory {
  margin-bottom: 4px;
  min-height: 32px;
}

.tree-view-row-leaf {
  margin-bottom: 2px;
  min-height: 28px;
  border: none;
  background: transparent;
}

.tree-view-row-expander {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  flex: 0 0 16px;
  color: #8b8b8b;
}

.tree-view-row:hover .tree-view-row-expander {
  color: #dcdcdc;
}

.tree-view-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  color: #8b8b8b;
}

.tree-view-row.is-selected .tree-view-row-icon {
  color: #007acc;
}

.tree-view-row-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.3;
}

.tree-view-row-badge {
  flex: 0 0 auto;
  margin-left: auto;
}

.tree-view-scroll {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: Fix sidebar tree content gap**

Find `.flowchart-sidebar-tree-content` (around line 344). Change `gap: 4px` to `gap: 2px`:

```css
.flowchart-sidebar-tree-content {
  min-width: 100%;
  width: max-content;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/styles/flowchart-editor.css
git commit -m "feat: update tree view row styles with vertical centering and spacing"
```

---

### Task 4: Change node tree click behavior

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx`

- [ ] **Step 1: Change onSelect for node-definition entries**

Find the `onSelect` handler (around line 682). Change the `node-definition` branch from:

```typescript
} else if (entry.kind === "node-definition" && canAddNode) {
  void onAddNode(entry.relativePath);
```

To:

```typescript
} else if (entry.kind === "node-definition") {
  onOpenEditNodeDefinition?.(entry.relativePath);
```

- [ ] **Step 2: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartSidebar.tsx
git commit -m "feat: node tree click opens definition editor instead of add dialog"
```

---

### Task 5: Add batchUpdateNodePropertyValue to useFlowChartEditor

**Files:**
- Modify: `app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts`

- [ ] **Step 1: Read the file to find insertion points**

```bash
cd app/desktop && grep -n "updateNodePropertyValue\|return {" src/flowchart-editor/hooks/useFlowChartEditor.ts
```

Expected: Find where `updateNodePropertyValue` is defined and where the return object starts (around line 2575).

- [ ] **Step 2: Add the batch update method**

After the existing `updateNodePropertyValue` definition, add:

```typescript
const batchUpdateNodePropertyValue = useCallback(
  (nodeIds: number[], propertyId: number, value: unknown) => {
    if (!activeDocument) return;
    pushUndoEntry();
    const updatedNodes = activeDocument.nodes.map((node) =>
      nodeIds.includes(node.nodeId)
        ? upsertNodePropertyValue(node, propertyId, value)
        : node,
    );
    updateActiveDocument({ nodes: updatedNodes });
  },
  [activeDocument, pushUndoEntry, updateActiveDocument],
);
```

- [ ] **Step 3: Export the new method in the return object**

In the return statement (around line 2575), find the returned object and add `batchUpdateNodePropertyValue,` alongside the existing `updateNodePropertyValue` export.

- [ ] **Step 4: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/hooks/useFlowChartEditor.ts
git commit -m "feat: add batchUpdateNodePropertyValue method to useFlowChartEditor"
```

---

### Task 6: Restructure FlowChartEditorView to three-column layout

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx`

- [ ] **Step 1: Remove FlowChartFloatingInspector import and usage**

Delete: `import { FlowChartFloatingInspector } from "./FlowChartFloatingInspector";`

Delete the `canvasRect` state (line 73):
```typescript
const [canvasRect, setCanvasRect] = useState<DOMRectReadOnly | null>(null);
```

Delete the ResizeObserver effect for canvasRect (lines 78-92):
```typescript
// Observe canvas panel position for floating inspector positioning
useEffect(() => {
  const panel = canvasPanelRef.current;
  if (!panel) return;
  const updateRect = () => { setCanvasRect(panel.getBoundingClientRect()); };
  updateRect();
  const observer = new ResizeObserver(updateRect);
  observer.observe(panel);
  return () => observer.disconnect();
}, []);
```

Delete the `FlowChartFloatingInspector` JSX block (around lines 588-605):
```tsx
<FlowChartFloatingInspector
  key={editor.selectedNode?.nodeId ?? "none"}
  activeDocument={editor.activeDocument}
  canvasRect={canvasRect}
  canvasTransform={canvasTransform}
  onClose={() => { editor.clearSelection(); }}
  onDeleteSelection={editor.deleteSelection}
  onDeleteSelectedConnection={editor.deleteSelectedConnection}
  onDeleteSelectedNode={editor.deleteSelectedNode}
  onUpdateNodePropertyValue={editor.updateNodePropertyValue}
  selectedConnection={editor.selectedConnectionItem}
  selectedConnectionCount={editor.selectedConnectionCount}
  selectedNode={editor.selectedNode}
  selectedNodeCount={editor.selectedNodeCount}
  selectedNodeDefinition={selectedNodeDefinition}
/>
```

Also delete: `const selectedNodeDefinition = editor.selectedNode ? ...` (line 36) since it's only used by the floating inspector.

- [ ] **Step 2: Add FlowChartInspectorPanel import**

```typescript
import { FlowChartInspectorPanel } from "./FlowChartInspectorPanel";
```

- [ ] **Step 3: Wrap editor panel and inspector panel in a grid container**

Change the `<main>` section from:

```tsx
<main className="workspace-main">
  <section className="editor-panel flowchart-editor-panel">
    ...
  </section>
</main>
```

To:

```tsx
<main className="workspace-main">
  <div className="flowchart-editor-layout">
    <section className="editor-panel flowchart-editor-panel">
      ...
    </section>
    <FlowChartInspectorPanel
      activeDocument={editor.activeDocument}
      selectedNodes={editor.selectedNodes}
      selectedNodeCount={editor.selectedNodeCount}
      selectedNodeDefinitions={editor.resolvedDefinitionsByType}
      onDeleteSelection={editor.deleteSelection}
      onDeleteSelectedNode={editor.deleteSelectedNode}
      onUpdateNodePropertyValue={editor.updateNodePropertyValue}
      onBatchUpdateNodePropertyValue={editor.batchUpdateNodePropertyValue}
    />
  </div>
</main>
```

- [ ] **Step 4: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors. May get a warning about unused `canvasTransform` or `canvasPanelRef` — remove `canvasTransform` if it's only used by the floating inspector. Keep `canvasPanelRef` if it's used elsewhere.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git commit -m "feat: restructure layout to three-column grid with inspector panel"
```

---

### Task 7: Add CSS for the inspector panel

**Files:**
- Modify: `app/desktop/src/styles/flowchart-editor.css`

- [ ] **Step 1: Remove the old floating inspector CSS**

Find and remove the entire `/* ── Floating Inspector ── */` section (around lines 954-1019 of current file). This includes all styles for `.flowchart-floating-inspector`, `.flowchart-floating-inspector-header`, `.flowchart-floating-inspector-close`, and `.flowchart-floating-inspector-body`.

- [ ] **Step 2: Add new inspector panel and layout styles**

Append at the end of `flowchart-editor.css`:

```css
/* ── Three-Column Layout ── */
.flowchart-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 0;
  height: 100%;
}

/* ── Fixed Inspector Panel ── */
.flowchart-inspector-panel {
  width: 320px;
  min-width: 320px;
  border-left: 1px solid #3c3c3c;
  margin-left: 6px;
  background: #252526;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.flowchart-inspector-panel-header {
  flex: 0 0 auto;
  padding: 10px;
  border-bottom: 1px solid #3c3c3c;
}

.flowchart-inspector-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.flowchart-inspector-panel-section {
  padding: 10px;
}

/* ── Compact Property Field ── */
.flowchart-inspector-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 10px;
}

.flowchart-inspector-field:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.flowchart-inspector-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.flowchart-inspector-field-header > span:first-child {
  font-size: 11px;
  color: #8b8b8b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.flowchart-inspector-field-type {
  font-size: 11px;
  color: #4fc1ff;
  font-family: Consolas, monospace;
}

.flowchart-inspector-field-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.flowchart-inspector-field-input-row .dialog-field-input,
.flowchart-inspector-field-input-row .flowchart-boolean-select {
  flex: 1 1 auto;
  min-width: 0;
}

/* ── Reset Icon Button ── */
.flowchart-inspector-reset-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: #8b8b8b;
  border-radius: 2px;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}

.flowchart-inspector-reset-icon:hover:not(:disabled) {
  color: #007acc;
  border-color: #007acc;
  background: rgba(0, 122, 204, 0.1);
}

.flowchart-inspector-reset-icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Mixed-value field (batch mode) ── */
.flowchart-inspector-field.is-mixed .dialog-field-input,
.flowchart-inspector-field.is-mixed .flowchart-boolean-select {
  background: #2d2020;
  border-color: #5a4a2a;
}

.flowchart-inspector-field.is-mixed .dialog-field-input::placeholder {
  color: #8b7355;
  font-style: italic;
}

/* ── Inspector field group ── */
.flowchart-inspector-field-group {
  display: flex;
  flex-direction: column;
}

.flowchart-inspector-actions {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #3c3c3c;
}

/* ── Override textarea for inspector ── */
.flowchart-inspector-textarea {
  min-height: 60px;
  resize: vertical;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/styles/flowchart-editor.css
git commit -m "feat: add CSS for inspector panel, compact property fields, batch mode"
```

---

### Task 8: Create FlowChartInspectorPanel component

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/FlowChartInspectorPanel.tsx`

- [ ] **Step 1: Write the complete component**

Create the file with the exact code below. This is the largest task — it includes mode detection, single-property input, batch-property input, and all four render modes (hidden/empty/single/batch).

```typescript
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
} from "../types/flowchartEditor";
import {
  findNodePropertyValue,
  formatFlowChartTypeRef,
} from "../utils/flowchartDocument";

type FlowChartInspectorPanelProps = {
  activeDocument: FlowChartFileDocument | null;
  selectedNodes: FlowChartNodeInstance[];
  selectedNodeCount: number;
  selectedNodeDefinitions: Record<string, FlowChartNodeDefinitionDocument>;
  onDeleteSelection: () => void;
  onDeleteSelectedNode: (nodeId: number) => void;
  onUpdateNodePropertyValue: (nodeId: number, propertyId: number, value: unknown) => void;
  onBatchUpdateNodePropertyValue: (nodeIds: number[], propertyId: number, value: unknown) => void;
};

type PanelMode = "hidden" | "empty" | "single" | "batch";

function getPanelMode(
  selectedNodes: FlowChartNodeInstance[],
  selectedNodeDefinitions: Record<string, FlowChartNodeDefinitionDocument>,
): { mode: PanelMode; definition: FlowChartNodeDefinitionDocument | null } {
  if (selectedNodes.length === 0) return { mode: "hidden", definition: null };

  const uniqueTypes = new Set(selectedNodes.map((n) => n.nodeType));
  if (uniqueTypes.size !== 1) return { mode: "empty", definition: null };

  const typeName = uniqueTypes.values().next().value;
  const definition = selectedNodeDefinitions[typeName] ?? null;
  if (!definition) return { mode: "empty", definition: null };

  if (selectedNodes.length === 1) return { mode: "single", definition };
  return { mode: "batch", definition };
}

// ── Utility functions ──

function formatEditorValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

function parseEditorValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function isBooleanType(rawType: string): boolean {
  return /^bool(ean)?$/i.test(rawType.trim());
}

function isNumericType(rawType: string): boolean {
  return /^(int(eger)?|long|float|double|decimal|number)$/i.test(rawType.trim());
}

// ── Property Input (single node) ──

type PropertyInputProps = {
  property: FlowChartNodeDefinitionDocument["properties"][number];
  currentValue: unknown;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onReset: () => void;
};

function PropertyInput({ property, currentValue, draftValue, onDraftChange, onReset }: PropertyInputProps) {
  const formattedType = formatFlowChartTypeRef(property.type);
  const isBoolean = isBooleanType(formattedType);
  const isNumeric = isNumericType(formattedType);
  const isDefault = currentValue === property.defaultValue || currentValue === undefined;
  const multiline = typeof currentValue === "object" && currentValue !== null;
  const label = property.alias ?? property.name;
  const defaultLabel = `默认值: ${formatEditorValue(property.defaultValue)}`;

  return (
    <label className="flowchart-inspector-field">
      <span className="flowchart-inspector-field-header">
        <span>{label}</span>
        <span className="flowchart-inspector-field-type">{formattedType}</span>
      </span>
      <span className="flowchart-inspector-field-input-row">
        {isBoolean ? (
          <select
            className="flowchart-boolean-select"
            onChange={(event) => onDraftChange(event.target.value)}
            value={draftValue}
          >
            <option value="">(空)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isNumeric ? (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            type="number"
            value={draftValue === "" ? "" : draftValue}
          />
        ) : multiline ? (
          <textarea
            className="dialog-field-textarea flowchart-inspector-textarea"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            rows={4}
            value={draftValue}
          />
        ) : (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            type="text"
            value={draftValue}
          />
        )}
        <button
          className="flowchart-inspector-reset-icon"
          disabled={isDefault}
          onClick={onReset}
          title="恢复默认"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7a6 6 0 1112 0A6 6 0 011 7z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M4 7h6M7 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </span>
    </label>
  );
}

// ── Batch Property Input ──

type BatchPropertyInputProps = {
  property: FlowChartNodeDefinitionDocument["properties"][number];
  allSame: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onReset: () => void;
};

function BatchPropertyInput({ property, allSame, draftValue, onDraftChange, onReset }: BatchPropertyInputProps) {
  const formattedType = formatFlowChartTypeRef(property.type);
  const isBoolean = isBooleanType(formattedType);
  const isNumeric = isNumericType(formattedType);
  const label = property.alias ?? property.name;
  const placeholder = allSame ? `默认值: ${formatEditorValue(property.defaultValue)}` : "(多个值)";

  return (
    <label className={`flowchart-inspector-field${!allSame ? " is-mixed" : ""}`}>
      <span className="flowchart-inspector-field-header">
        <span>{label}</span>
        <span className="flowchart-inspector-field-type">{formattedType}</span>
      </span>
      <span className="flowchart-inspector-field-input-row">
        {isBoolean ? (
          <select
            className="flowchart-boolean-select"
            onChange={(event) => onDraftChange(event.target.value)}
            value={draftValue}
          >
            <option value="">(空)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isNumeric ? (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            type="number"
            value={draftValue === "" ? "" : draftValue}
          />
        ) : (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={draftValue}
          />
        )}
        <button
          className="flowchart-inspector-reset-icon"
          disabled={false}
          onClick={onReset}
          title="恢复默认"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7a6 6 0 1112 0A6 6 0 011 7z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M4 7h6M7 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </span>
    </label>
  );
}

// ── Main Component ──

export function FlowChartInspectorPanel({
  activeDocument,
  selectedNodes,
  selectedNodeCount,
  selectedNodeDefinitions,
  onDeleteSelection,
  onDeleteSelectedNode,
  onUpdateNodePropertyValue,
  onBatchUpdateNodePropertyValue,
}: FlowChartInspectorPanelProps) {
  const { mode, definition } = useMemo(
    () => getPanelMode(selectedNodes, selectedNodeDefinitions),
    [selectedNodes, selectedNodeDefinitions],
  );

  // Draft state: propertyId → raw string
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});
  const selectionKey = useMemo(
    () => selectedNodes.map((n) => n.nodeId).sort().join(","),
    [selectedNodes],
  );

  // Reset drafts when selection changes
  const prevSelectionKeyRef = useRef(selectionKey);
  if (prevSelectionKeyRef.current !== selectionKey) {
    prevSelectionKeyRef.current = selectionKey;
    setDraftValues({});
  }

  const handleDraftChange = useCallback((propertyId: number, value: string) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: value }));
  }, []);

  const handleReset = useCallback((propertyId: number, defaultValue: unknown) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: formatEditorValue(defaultValue) }));
  }, []);

  const handleCommit = useCallback(() => {
    if (!definition) return;

    if (mode === "single" && selectedNodes[0]) {
      const node = selectedNodes[0];
      for (const prop of definition.properties) {
        const draft = draftValues[prop.propertyId];
        if (draft !== undefined) {
          const parsed = parseEditorValue(draft);
          onUpdateNodePropertyValue(node.nodeId, prop.propertyId, parsed);
        }
      }
      setDraftValues({});
    }

    if (mode === "batch") {
      const nodeIds = selectedNodes.map((n) => n.nodeId);
      for (const prop of definition.properties) {
        const draft = draftValues[prop.propertyId];
        if (draft !== undefined) {
          const parsed = parseEditorValue(draft);
          onBatchUpdateNodePropertyValue(nodeIds, prop.propertyId, parsed);
        }
        // If no draft, skip — each node keeps its original value
      }
      setDraftValues({});
    }
  }, [definition, mode, selectedNodes, draftValues, onUpdateNodePropertyValue, onBatchUpdateNodePropertyValue]);

  // ── Render: hidden mode ──
  if (mode === "hidden" || !activeDocument) {
    return null;
  }

  // ── Render: empty mode ──
  if (mode === "empty") {
    return (
      <aside className="flowchart-inspector-panel">
        <section className="tree-card flowchart-inspector-panel-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点与连线</p>
              <strong>无法批量编辑</strong>
            </div>
          </div>
          <p className="status-detail">选中的节点类型不一致。批量编辑仅支持同类节点。</p>
        </section>
      </aside>
    );
  }

  // ── Render: single mode ──
  if (mode === "single" && definition) {
    const node = selectedNodes[0];
    return (
      <aside className="flowchart-inspector-panel">
        <div className="flowchart-inspector-panel-header">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点属性</p>
              <strong>{definition.alias ?? definition.name}</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={() => onDeleteSelectedNode(node.nodeId)} type="button">
              删除
            </button>
          </div>
          <div className="flowchart-inspector-field-meta flowchart-inspector-summary-row">
            <span>nodeId {node.nodeId}</span>
            <span>{node.nodeType}</span>
          </div>
        </div>

        <div className="flowchart-inspector-panel-body">
          {definition.properties.length === 0 ? (
            <p className="status-detail">当前节点没有可编辑属性。</p>
          ) : (
            <div className="flowchart-inspector-field-group">
              {definition.properties.map((prop) => {
                const committedValue = findNodePropertyValue(node, prop.propertyId) ?? prop.defaultValue;
                const draftValue = draftValues[prop.propertyId] ?? formatEditorValue(committedValue);
                return (
                  <PropertyInput
                    key={prop.propertyId}
                    property={prop}
                    currentValue={committedValue}
                    draftValue={draftValue}
                    onDraftChange={(val) => handleDraftChange(prop.propertyId, val)}
                    onReset={() => handleReset(prop.propertyId, prop.defaultValue)}
                  />
                );
              })}
              <div className="flowchart-inspector-actions">
                <button className="primary-button" onClick={handleCommit} type="button">
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // ── Render: batch mode ──
  if (mode === "batch" && definition) {
    const typeName = definition.alias ?? definition.name;
    return (
      <aside className="flowchart-inspector-panel">
        <div className="flowchart-inspector-panel-header">
          <div className="section-header">
            <div>
              <p className="eyebrow">批量编辑</p>
              <strong>{selectedNodeCount}个节点（{typeName}）</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelection} type="button">
              删除
            </button>
          </div>
          <p className="status-detail">未修改的字段将保持各节点原值。</p>
        </div>

        <div className="flowchart-inspector-panel-body">
          {definition.properties.length === 0 ? (
            <p className="status-detail">当前节点没有可编辑属性。</p>
          ) : (
            <div className="flowchart-inspector-field-group">
              {definition.properties.map((prop) => {
                const values = selectedNodes.map(
                  (n) => findNodePropertyValue(n, prop.propertyId) ?? prop.defaultValue,
                );
                const allSame = values.every((v) => formatEditorValue(v) === formatEditorValue(values[0]));
                const displayValue = allSame ? formatEditorValue(values[0]) : "";
                const draftValue = draftValues[prop.propertyId] ?? displayValue;

                return (
                  <BatchPropertyInput
                    key={prop.propertyId}
                    property={prop}
                    allSame={allSame}
                    draftValue={draftValue}
                    onDraftChange={(val) => handleDraftChange(prop.propertyId, val)}
                    onReset={() => handleReset(prop.propertyId, prop.defaultValue)}
                  />
                );
              })}
              <div className="flowchart-inspector-actions">
                <button className="primary-button" onClick={handleCommit} type="button">
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartInspectorPanel.tsx
git commit -m "feat: create FlowChartInspectorPanel component with single/batch modes"
```

---

### Task 9: Add drop-to-canvas support for dragged node definitions

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartCanvas.tsx`

- [ ] **Step 1: Add `onDropNodeDefinition` to FlowChartCanvas props**

Add to the `FlowChartCanvasProps` type (around line 70, after `onOpenAddNodeDialog`):

```typescript
onDropNodeDefinition?: (nodeType: string, position: { x: number; y: number }) => void;
```

- [ ] **Step 2: Add drop handler to the canvas viewport**

Find the viewport div (around line 898, `className="flowchart-canvas-viewport"`). Add `onDragOver` and `onDrop` handlers:

```tsx
onDragOver={(event) => {
  // Only accept drags carrying node-definition paths
  if (event.dataTransfer.types.includes("text/plain")) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
}}
onDrop={(event) => {
  event.preventDefault();
  const nodeType = event.dataTransfer.getData("text/plain");
  if (!nodeType || !onDropNodeDefinition) return;

  // Convert screen coords to canvas coords
  const viewport = event.currentTarget as HTMLElement;
  const rect = viewport.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;

  onDropNodeDefinition(nodeType, { x: screenX, y: screenY });
}}
```

- [ ] **Step 3: Wire up drop handler in FlowChartEditorView.tsx**

Add `onDropNodeDefinition` to the FlowChartCanvas JSX:

```tsx
<FlowChartCanvas
  // ... existing props ...
  onDropNodeDefinition={(nodeType, position) => {
    void editor.addNode(nodeType, position);
  }}
/>
```

Also remove `canvasTransform` from FlowChartCanvas props in this same file — it was only needed for the floating inspector. Check if `onViewTransformChange` is still needed (it is — for the zoom toolbar percentage).

- [ ] **Step 4: Verify build**

Run: `cd app/desktop && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartCanvas.tsx app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git commit -m "feat: add drag-to-canvas support for node definitions"
```

---

### Task 10: Delete old files and final cleanup

**Files:**
- Delete: `app/desktop/src/flowchart-editor/components/FlowChartFloatingInspector.tsx`
- Delete: `app/desktop/src/flowchart-editor/components/FlowChartInspector.tsx`

- [ ] **Step 1: Verify no remaining imports of deleted files**

```bash
cd app/desktop && grep -r "FlowChartFloatingInspector\|FlowChartInspector" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results. If any imports remain, remove them.

- [ ] **Step 2: Delete the old files**

```bash
git rm app/desktop/src/flowchart-editor/components/FlowChartFloatingInspector.tsx
git rm app/desktop/src/flowchart-editor/components/FlowChartInspector.tsx
```

- [ ] **Step 3: Final build verification**

```bash
cd app/desktop && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove deprecated FlowChartFloatingInspector and FlowChartInspector"
```

---

### Task 11: End-to-end verification

**Files:** None (manual test)

- [ ] **Step 1: Start the app**

```bash
cd app/desktop && npm run dev
```

- [ ] **Step 2: Verify tree click behavior**

Open a workspace with node definitions. Click a node in the node tree tab.
Expected: The node definition editor dialog opens, not the "add node" dialog.

- [ ] **Step 3: Verify tree icon appearance**

Look at directory icons, flowchart file icons, and node definition icons.
Expected: All icons are 18×18, B&W line style. Node-def icons show E/F/C with appropriate type colors. Directories show folder outlines.

- [ ] **Step 4: Verify inspector panel layout**

Open a flowchart. Click a single node on the canvas.
Expected: The right-side inspector panel appears at 320px wide. It shows the compact property fields with field name + type on one line, input + reset button on the next line.

- [ ] **Step 5: Verify restore default button**

Edit a node property value. The reset icon (↺) should be active (not disabled). Click it — the value should revert to the default.
Expected: Input shows default value. Reset button becomes disabled when value equals default.

- [ ] **Step 6: Verify batch editing**

Select multiple nodes of the same type (Ctrl+click on canvas).
Expected: Inspector panel shows "N个节点（TypeName）" header and batch mode fields. Fields with identical values show the value. Fields with differing values show "(多个值)" placeholder with distinct background.

- [ ] **Step 7: Verify batch save**

In batch mode, edit a field and click "确定".
Expected: The edited field is updated on all selected nodes. Unchanged fields keep each node's original value.

- [ ] **Step 8: Verify drag-to-canvas**

Drag a node definition from the sidebar node tree onto the canvas.
Expected: A new node instance is created at the drop position.

- [ ] **Step 9: Verify floating inspector is gone**

The old floating inspector (positioned overlay next to nodes) should no longer appear.
Expected: Only the fixed right-side panel exists.

- [ ] **Step 10: Commit any final fixes**

```bash
git add -A && git commit -m "fix: address verification findings"
```
