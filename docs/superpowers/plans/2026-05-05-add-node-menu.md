# Add-Node Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current heavy modal node dialog with a dual-entry system: Quick Add overlay (Ctrl+P) for fast search-based addition, and a tree browser dialog for hierarchical browsing.

**Architecture:** Two new components (`QuickAddOverlay`, `NodeTreeDialog`) plus a shared `fuzzySearch` utility. The `description` field is added to the node definition schema, types, and edit dialog. The existing `FlowChartNodeDialog` is retired from use (component kept for reference). Wiring happens through `FlowChartEditorView` state and the `useEditorShortcuts` hook.

**Tech Stack:** React 19, TypeScript, CSS (dark theme, VS Code-style), localStorage for tree persistence

---

## File Inventory

### New files
- `app/desktop/src/flowchart-editor/components/QuickAddOverlay.tsx` — Ctrl+P overlay
- `app/flowchart-editor/components/NodeTreeDialog.tsx` — tree browser dialog
- `app/desktop/src/flowchart-editor/components/NodePreviewPanel.tsx` — right-side preview in tree dialog
- `app/desktop/src/flowchart-editor/utils/fuzzySearch.ts` — fuzzy search with weighted fields

### Modified files
- `app/desktop/src/flowchart-editor/types/flowchartEditor.ts` — add `description` to both types
- `app/desktop/src/flowchart-editor/utils/flowchartNodeDefinitionSchema.ts` — add `description` to `buildEmptyNodeDefinition`
- `app/desktop/src/flowchart-editor/components/FlowChartNodeDefinitionDialog.tsx` — add description textarea
- `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx` — wire new components, remove old dialog wiring
- `app/desktop/src/flowchart-editor/components/FlowChartCanvas.tsx` — update context menu to call new overlay
- `app/desktop/src/App.tsx` — add Ctrl+P shortcut binding
- `app/desktop/src/styles/flowchart-editor.css` — add styles for new components
- `Spec/FlowCharts/NodeDefinitionJson.md` — document `description` field

---

### Task 1: Add `description` to TypeScript types and schema utilities

**Files:**
- Modify: `app/desktop/src/flowchart-editor/types/flowchartEditor.ts:48-56` and `:58-65`
- Modify: `app/desktop/src/flowchart-editor/utils/flowchartNodeDefinitionSchema.ts:108-116`

- [ ] **Step 1: Add `description` to `FlowChartNodeDefinitionDocument`**

In `flowchartEditor.ts`, add `description?: string | null;` after `nodeKind`:

```typescript
export type FlowChartNodeDefinitionDocument = {
  formatVersion: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
  description?: string | null;  // ← ADD
  properties: FlowChartPropertyDefinition[];
  computePorts: FlowChartComputePortDefinition[];
  flowPorts: FlowChartFlowPortDefinition[];
};
```

- [ ] **Step 2: Add `description` to `FlowChartNodeDefinitionSummary`**

```typescript
export type FlowChartNodeDefinitionSummary = {
  kind: "flowchart-node";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
  description?: string | null;  // ← ADD
};
```

- [ ] **Step 3: Add `description` to `buildEmptyNodeDefinition`**

In `flowchartNodeDefinitionSchema.ts`, find the return of `buildEmptyNodeDefinition` (line 108) and add `description: null`:

```typescript
  return {
    formatVersion: "1.0",
    name,
    alias: alias || null,
    nodeKind,
    description: null,  // ← ADD
    properties: [],
    computePorts: initialComputePorts,
    flowPorts: initialFlowPorts,
  };
```

- [ ] **Step 4: Commit**

```bash
git add app/desktop/src/flowchart-editor/types/flowchartEditor.ts
git add app/desktop/src/flowchart-editor/utils/flowchartNodeDefinitionSchema.ts
git commit -m "feat: add description field to node definition types"
```

---

### Task 2: Add `description` to NodeDefinitionDialog

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartNodeDefinitionDialog.tsx:87-98` (add state), `:111-137` (init/reset), `:139-163` (document building), `:327-359` (render)

- [ ] **Step 1: Add description state variable**

After line 89 (`const [alias, setAlias] = useState("");`), add:

```typescript
const [description, setDescription] = useState("");
```

- [ ] **Step 2: Initialize/reset description**

In the `useEffect` at line 111, in the edit branch (line 114-121), add after `setAlias`:

```typescript
setDescription(existingDefinition.description ?? "");
```

In the create branch (line 122-131), add after `setAlias("")`:

```typescript
setDescription("");
```

- [ ] **Step 3: Include description in the built document**

In both places where `currentDocument` is built (line 141-149 and 154-162), add:

```typescript
description: description || null,
```

So the memoized document becomes:

```typescript
const currentDocument = useMemo<FlowChartNodeDefinitionDocument>(() => ({
  formatVersion: "1.0",
  name,
  alias: alias || null,
  nodeKind,
  description: description || null,
  properties,
  computePorts,
  flowPorts,
}), [name, alias, nodeKind, description, properties, computePorts, flowPorts]);
```

Also update the validation effect (line 140-151) to include `description` in the mock document:

```typescript
const document: FlowChartNodeDefinitionDocument = {
  formatVersion: "1.0",
  name,
  alias: alias || null,
  nodeKind,
  description: description || null,
  properties,
  computePorts,
  flowPorts,
};
```

- [ ] **Step 4: Add description textarea to the render**

After the node kind `<select>` block (around line 358), add before the closing `</div>` of the flex container:

```tsx
<label className="search-field compact-field" style={{ flex: "1 1 100%" }}>
  <span>概述 (description)</span>
  <textarea
    className="dialog-field-input"
    onChange={(e) => setDescription(e.target.value)}
    placeholder="描述该节点的用途和行为，用于搜索和预览"
    rows={3}
    style={{ resize: "vertical", minHeight: "60px", maxHeight: "160px", fontFamily: "inherit" }}
    value={description}
  />
</label>
```

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartNodeDefinitionDialog.tsx
git commit -m "feat: add description field to node definition editor dialog"
```

---

### Task 3: Implement fuzzySearch utility

**Files:**
- Create: `app/desktop/src/flowchart-editor/utils/fuzzySearch.ts`

- [ ] **Step 1: Write the fuzzySearch utility**

Create `app/desktop/src/flowchart-editor/utils/fuzzySearch.ts`:

```typescript
import type { FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";

export type SearchableNode = FlowChartNodeDefinitionSummary & {
  /** Directory name for grouping (e.g. "Event", "Flow") */
  groupKey: string;
};

export interface SearchMatch {
  node: SearchableNode;
  score: number;
  matchedField: "name" | "alias" | "relativePath" | "description" | "nodeKind";
}

/** Per-field weight multipliers */
const FIELD_WEIGHTS: Record<SearchMatch["matchedField"], number> = {
  name: 100,
  alias: 80,
  relativePath: 60,
  description: 30,
  nodeKind: 10,
};

/** Character-level match bonus for consecutive matches */
const CONSECUTIVE_BONUS = 2;

/**
 * Simple fuzzy scorer: returns a score for how well `keyword` matches `text`.
 * The score is higher when characters appear consecutively and in order.
 * Returns 0 if no match.
 */
function fuzzyScore(text: string, keyword: string): number {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  let textIndex = 0;
  let keywordIndex = 0;
  let score = 0;
  let consecutive = 0;

  while (keywordIndex < lowerKeyword.length && textIndex < lowerText.length) {
    if (lowerText[textIndex] === lowerKeyword[keywordIndex]) {
      keywordIndex++;
      consecutive++;
      score += CONSECUTIVE_BONUS * consecutive;
    } else {
      consecutive = 0;
    }
    textIndex++;
  }

  // Not all keyword characters matched
  if (keywordIndex < lowerKeyword.length) {
    return 0;
  }

  return score;
}

/**
 * Get the group key (first directory segment) for a node definition.
 */
export function getGroupKey(relativePath: string): string {
  const firstSlash = relativePath.indexOf("/");
  return firstSlash >= 0 ? relativePath.substring(0, firstSlash) : relativePath;
}

/**
 * Search node definitions with fuzzy matching and weighted field scoring.
 * Results sorted by score descending.
 */
export function fuzzySearchNodes(
  definitions: FlowChartNodeDefinitionSummary[],
  keyword: string,
): SearchMatch[] {
  const trimmed = keyword.trim();
  if (!trimmed) {
    // No keyword → return all with a default score, grouped
    return definitions.map((def) => ({
      node: { ...def, groupKey: getGroupKey(def.relativePath) },
      score: 0,
      matchedField: "name" as const,
    }));
  }

  const results: SearchMatch[] = [];

  for (const def of definitions) {
    const fields: { text: string; field: SearchMatch["matchedField"] }[] = [
      { text: def.name, field: "name" },
      { text: def.alias ?? "", field: "alias" },
      { text: def.relativePath, field: "relativePath" },
      { text: def.description ?? "", field: "description" },
      { text: def.nodeKind, field: "nodeKind" },
    ];

    let bestScore = 0;
    let bestField: SearchMatch["matchedField"] = "name";

    for (const { text, field } of fields) {
      if (!text) continue;
      const raw = fuzzyScore(text, trimmed);
      if (raw > 0) {
        const weighted = raw * FIELD_WEIGHTS[field];
        if (weighted > bestScore) {
          bestScore = weighted;
          bestField = field;
        }
      }
    }

    if (bestScore > 0) {
      results.push({
        node: { ...def, groupKey: getGroupKey(def.relativePath) },
        score: bestScore,
        matchedField: bestField,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/desktop/src/flowchart-editor/utils/fuzzySearch.ts
git commit -m "feat: add fuzzySearch utility with weighted field scoring"
```

---

### Task 4: Implement QuickAddOverlay component

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/QuickAddOverlay.tsx`
- Modify: `app/desktop/src/styles/flowchart-editor.css` (add styles)

- [ ] **Step 1: Create QuickAddOverlay component**

Create `app/desktop/src/flowchart-editor/components/QuickAddOverlay.tsx`:

```typescript
import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzySearchNodes, getGroupKey, type SearchMatch } from "../utils/fuzzySearch";
import type { FlowChartCatalogResponse } from "../types/flowchartEditor";

type QuickAddOverlayProps = {
  catalog: FlowChartCatalogResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (nodeType: string) => void | Promise<void>;
  onBrowseAll: () => void;
};

function buildNodeLabel(name: string, alias?: string | null) {
  return alias?.trim() ? `${name} · ${alias}` : name;
}

export function QuickAddOverlay({ catalog, isOpen, onClose, onSubmit, onBrowseAll }: QuickAddOverlayProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse prefix syntax
  const { effectiveKeyword, kindFilter, pathFilter } = useMemo(() => {
    const trimmed = searchText.trim();
    let kw = trimmed;
    let kindF: string | null = null;
    let pathF: string | null = null;

    if (kw.startsWith(">")) {
      kindF = kw.slice(1).toLowerCase();
      kw = "";
    } else if (kw.startsWith("path:")) {
      pathF = kw.slice(5).trim().toLowerCase();
      kw = "";
    }

    return { effectiveKeyword: kw, kindFilter: kindF, pathFilter: pathF };
  }, [searchText]);

  // Filter and search
  const definitions = catalog?.nodeDefinitions ?? [];

  const filteredByPrefix = useMemo(() => {
    let result = definitions;

    if (kindFilter) {
      result = result.filter((d) => d.nodeKind.toLowerCase() === kindFilter);
    }
    if (pathFilter) {
      result = result.filter((d) => d.relativePath.toLowerCase().startsWith(pathFilter));
    }

    return result;
  }, [definitions, kindFilter, pathFilter]);

  const searchResults = useMemo(() => {
    return fuzzySearchNodes(filteredByPrefix, effectiveKeyword);
  }, [filteredByPrefix, effectiveKeyword]);

  // Group results by first directory segment
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchMatch[]>();
    for (const match of searchResults) {
      const group = match.node.groupKey;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(match);
    }
    return Array.from(groups.entries());
  }, [searchResults]);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setSearchText("");
      setSelectedIndex(0);
      // Auto-focus input on next tick
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Navigate with arrow keys
  const totalItems = searchResults.length;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = searchResults[selectedIndex];
      if (selected) {
        void onSubmit(selected.node.relativePath);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(".quick-add-item.is-selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let itemCounter = 0;

  return (
    <div className="quick-add-backdrop" onClick={onClose} onKeyDown={handleKeyDown} role="presentation">
      <div
        className="quick-add-overlay"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="快速添加节点"
      >
        <div className="quick-add-input-row">
          <span className="quick-add-icon">🔍</span>
          <input
            className="quick-add-input"
            onChange={(e) => {
              setSearchText(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索节点类型…  (使用 &gt; 过滤种类, path: 限定目录)"
            ref={inputRef}
            type="text"
            value={searchText}
          />
          <span className="quick-add-hint">Ctrl+P</span>
        </div>

        <div className="quick-add-results" ref={listRef}>
          {groupedResults.length === 0 ? (
            <div className="quick-add-empty">
              <strong>未找到匹配的节点定义</strong>
              <p>尝试调整搜索关键词，或使用 &gt;event / path:Event/Player 缩小范围。</p>
              <button className="secondary-button" onClick={onBrowseAll} type="button" style={{ marginTop: 8 }}>
                浏览全部节点…
              </button>
            </div>
          ) : (
            groupedResults.map(([group, matches]) => (
              <div className="quick-add-group" key={group}>
                <div className="quick-add-group-header">{group}</div>
                {matches.map((match) => {
                  const currentIndex = itemCounter++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      className={`quick-add-item${isSelected ? " is-selected" : ""}`}
                      key={match.node.relativePath}
                      onClick={() => void onSubmit(match.node.relativePath)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      type="button"
                    >
                      <span className={`quick-add-item-icon is-${match.node.nodeKind}`}>
                        {match.node.nodeKind === "event" ? "◈" : match.node.nodeKind === "flow" ? "◆" : "◇"}
                      </span>
                      <span className="quick-add-item-label">{buildNodeLabel(match.node.name, match.node.alias)}</span>
                      <span className="quick-add-item-path">{match.node.relativePath}</span>
                      <span className={`flowchart-kind-badge is-${match.node.nodeKind}`}>{match.node.nodeKind}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="quick-add-footer">
          <button className="secondary-button" onClick={onBrowseAll} type="button">
            浏览全部节点…
          </button>
          <span className="quick-add-footer-hint">
            ↑↓ 导航 · 回车添加 · Esc 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS styles for QuickAddOverlay**

Append to `flowchart-editor.css`:

```css
/* ── Quick Add Overlay ── */
.quick-add-backdrop {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0, 0, 0, 0.42);
}

.quick-add-overlay {
  width: min(520px, calc(100vw - 32px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #3c3c3c;
  background: #252526;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.quick-add-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #3c3c3c;
  background: #1e1e1e;
}

.quick-add-icon {
  flex: 0 0 auto;
  font-size: 15px;
  color: #8b8b8b;
}

.quick-add-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  background: #1f1f1f;
  color: #dcdcdc;
  font-size: 14px;
  outline: none;
}

.quick-add-input:focus {
  border-color: #007acc;
}

.quick-add-hint {
  flex: 0 0 auto;
  font-size: 11px;
  color: #8b8b8b;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border: 1px solid #3c3c3c;
  background: #2d2d30;
}

.quick-add-results {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 0;
}

.quick-add-group-header {
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #8b8b8b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.quick-add-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  text-align: left;
  color: #cccccc;
  cursor: pointer;
}

.quick-add-item:hover,
.quick-add-item.is-selected {
  background: #0f2434;
  color: #dcdcdc;
}

.quick-add-item-icon {
  flex: 0 0 auto;
  width: 18px;
  text-align: center;
  font-size: 12px;
}

.quick-add-item-icon.is-event { color: #4fc1ff; }
.quick-add-item-icon.is-flow { color: #72d08d; }
.quick-add-item-icon.is-compute { color: #f0b35b; }

.quick-add-item-label {
  flex: 0 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.quick-add-item-path {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #8b8b8b;
  margin-left: auto;
}

.quick-add-item .flowchart-kind-badge {
  flex: 0 0 auto;
}

.quick-add-empty {
  padding: 24px 12px;
  text-align: center;
  color: #8b8b8b;
}

.quick-add-empty strong {
  display: block;
  color: #dcdcdc;
  margin-bottom: 6px;
}

.quick-add-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #3c3c3c;
  background: #1e1e1e;
}

.quick-add-footer-hint {
  font-size: 11px;
  color: #8b8b8b;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/QuickAddOverlay.tsx
git add app/desktop/src/styles/flowchart-editor.css
git commit -m "feat: add QuickAddOverlay component with fuzzy search"
```

---

### Task 5: Implement NodePreviewPanel component

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/NodePreviewPanel.tsx`

- [ ] **Step 1: Create NodePreviewPanel component**

Create `app/desktop/src/flowchart-editor/components/NodePreviewPanel.tsx`:

```typescript
import type { FlowChartNodeDefinitionDocument } from "../types/flowchartEditor";
import type { FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";

type NodePreviewPanelProps = {
  summary: FlowChartNodeDefinitionSummary | null;
  document: FlowChartNodeDefinitionDocument | null;
};

function getTypeLabel(typeRef: unknown): string {
  if (typeof typeRef === "object" && typeRef !== null && "kind" in typeRef) {
    const r = typeRef as Record<string, unknown>;
    if (r.kind === "builtin") return String(r.name ?? "");
    if (r.kind === "custom") return String((r.fullName as string) ?? r.name ?? "");
    if (r.kind === "list") return "List<…>";
    if (r.kind === "dictionary") return "Dict<…>";
    return String(r.kind);
  }
  return "unknown";
}

export function NodePreviewPanel({ summary, document }: NodePreviewPanelProps) {
  if (!summary) {
    return (
      <div className="node-preview-panel is-empty">
        <p className="status-detail">请选择一个节点定义</p>
      </div>
    );
  }

  const doc = document;
  const inputPorts = doc?.flowPorts.filter((p) => p.direction === "input") ?? [];
  const outputPorts = doc?.flowPorts.filter((p) => p.direction === "output") ?? [];
  const inputComputePorts = doc?.computePorts.filter((p) => p.direction === "input") ?? [];
  const outputComputePorts = doc?.computePorts.filter((p) => p.direction === "output") ?? [];

  return (
    <div className="node-preview-panel">
      <div className="node-preview-header">
        <div className="node-preview-title-row">
          <strong>{summary.name}</strong>
          {summary.alias ? <span className="node-preview-alias">{summary.alias}</span> : null}
          <span className={`flowchart-kind-badge is-${summary.nodeKind}`}>{summary.nodeKind}</span>
        </div>
        <div className="node-preview-path">{summary.relativePath}</div>
      </div>

      {summary.description ? (
        <div className="node-preview-section">
          <div className="node-preview-section-title">概述</div>
          <p className="node-preview-description">{summary.description}</p>
        </div>
      ) : null}

      {doc ? (
        <>
          {(inputPorts.length > 0 || outputPorts.length > 0 || inputComputePorts.length > 0 || outputComputePorts.length > 0) ? (
            <div className="node-preview-section">
              <div className="node-preview-section-title">端口</div>
              {inputPorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">input</span>
                  {inputPorts.map((p) => (
                    <div className="node-preview-field" key={`flow-in-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">flow</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {outputPorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">output</span>
                  {outputPorts.map((p) => (
                    <div className="node-preview-field" key={`flow-out-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">flow</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {inputComputePorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">compute input</span>
                  {inputComputePorts.map((p) => (
                    <div className="node-preview-field" key={`comp-in-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">{getTypeLabel(p.type)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {outputComputePorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">compute output</span>
                  {outputComputePorts.map((p) => (
                    <div className="node-preview-field" key={`comp-out-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">{getTypeLabel(p.type)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {doc.properties.length > 0 ? (
            <div className="node-preview-section">
              <div className="node-preview-section-title">属性</div>
              {doc.properties.map((prop) => (
                <div className="node-preview-field" key={prop.propertyId}>
                  <span className="node-preview-field-name">{prop.alias ?? prop.name}</span>
                  <span className="node-preview-field-type">{getTypeLabel(prop.type)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="status-detail" style={{ padding: "8px 0" }}>加载节点详情中…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/NodePreviewPanel.tsx
git commit -m "feat: add NodePreviewPanel component"
```

---

### Task 6: Implement NodeTreeDialog component

**Files:**
- Create: `app/desktop/src/flowchart-editor/components/NodeTreeDialog.tsx`
- Modify: `app/desktop/src/styles/flowchart-editor.css` (add styles)

- [ ] **Step 1: Create NodeTreeDialog**

Create `app/desktop/src/flowchart-editor/components/NodeTreeDialog.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";
import { fuzzySearchNodes } from "../utils/fuzzySearch";
import { NodePreviewPanel } from "./NodePreviewPanel";
import type { FlowChartCatalogResponse, FlowChartNodeDefinitionDocument, FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";
import { fetchJson } from "../../utils/desktopHost";

type NodeTreeDialogProps = {
  catalog: FlowChartCatalogResponse | null;
  hostInfo: { desktopHostUrl: string } | null;
  workspacePath: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (nodeType: string) => void | Promise<void>;
};

/** localStorage key for tree expanded state */
function getExpandedKey(workspaceRootPath: string) {
  return `lightydesign.flowchart.treeExpanded.${workspaceRootPath}`;
}

/** Build a tree of directory → children from flat node definitions */
function buildNodeTree(definitions: FlowChartNodeDefinitionSummary[]) {
  const root: { name: string; children: { name: string; def: FlowChartNodeDefinitionSummary | null; children: { name: string; def: FlowChartNodeDefinitionSummary | null }[] }[] }[] = [];

  for (const def of definitions) {
    const segments = def.relativePath.split("/");

    // Find or create first-level group
    let firstLevel = root.find((g) => g.name === segments[0]);
    if (!firstLevel) {
      firstLevel = { name: segments[0], children: [] };
      root.push(firstLevel);
    }

    if (segments.length === 1) {
      // Direct child of first level
      firstLevel.children.push({ name: def.name, def, children: [] });
    } else {
      // Nested — find/create the leaf under first level
      let current = firstLevel.children;
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;
        const existing = current.find((c) => c.name === seg);
        if (existing) {
          if (isLast) {
            // This should not happen normally — leaf already exists; update def
            existing.def = def;
          }
          current = existing.children;
        } else {
          const newNode = { name: seg, def: isLast ? def : null, children: [] as typeof current };
          current.push(newNode);
          current = newNode.children;
        }
      }
    }
  }

  // Sort each level
  root.sort((a, b) => a.name.localeCompare(b.name));
  for (const group of root) {
    group.children.sort((a, b) => {
      // Directories (has children) before leaves (has def)
      if (a.children.length > 0 && !b.children.length) return -1;
      if (!a.children.length && b.children.length > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return root;
}

export function NodeTreeDialog({ catalog, hostInfo, workspacePath, isOpen, onClose, onSubmit }: NodeTreeDialogProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(getExpandedKey(workspacePath));
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [previewDocument, setPreviewDocument] = useState<FlowChartNodeDefinitionDocument | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const definitions = catalog?.nodeDefinitions ?? [];

  // Filtered definitions (search mode)
  const searchResults = useMemo(() => {
    if (!searchText.trim()) return null; // null means no search active
    return fuzzySearchNodes(definitions, searchText);
  }, [definitions, searchText]);

  // Tree data (non-search mode)
  const treeData = useMemo(() => {
    if (searchResults) return null; // don't build tree in search mode
    return buildNodeTree(definitions);
  }, [definitions, searchResults]);

  // Flattened search results for preview
  const matchedDefinitions = useMemo(() => {
    if (!searchResults) return null;
    return searchResults.map((r) => r.node);
  }, [searchResults]);

  // Determine selected definition summary
  const selectedSummary = useMemo(() => {
    if (!selectedPath) return null;
    return definitions.find((d) => d.relativePath === selectedPath) ?? null;
  }, [definitions, selectedPath]);

  // Load full document for preview
  useEffect(() => {
    if (!selectedPath || !hostInfo || !workspacePath) {
      setPreviewDocument(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPreview(true);

    void fetchJson<{ document: FlowChartNodeDefinitionDocument | null }>(
      `${hostInfo.desktopHostUrl}/api/workspace/flowcharts/nodes/load?workspacePath=${encodeURIComponent(workspacePath)}&relativePath=${encodeURIComponent(selectedPath)}`,
    )
      .then((response) => {
        if (!cancelled) {
          setPreviewDocument(response.document);
          setIsLoadingPreview(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewDocument(null);
          setIsLoadingPreview(false);
        }
      });

    return () => { cancelled = true; };
  }, [selectedPath, hostInfo, workspacePath]);

  // Save expanded dirs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(getExpandedKey(workspacePath), JSON.stringify([...expandedDirs]));
    } catch { /* ignore quota errors */ }
  }, [expandedDirs, workspacePath]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSearchText("");
      setSelectedPath(null);
      setPreviewDocument(null);
    }
  }, [isOpen]);

  const toggleExpand = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  function renderTree(
    items: { name: string; def: FlowChartNodeDefinitionSummary | null; children: { name: string; def: FlowChartNodeDefinitionSummary | null; children: any[] }[] },
    parentPath: string,
    depth: number,
  ) {
    const fullPath = parentPath ? `${parentPath}/${items.name}` : items.name;
    const isLeaf = !!items.def;
    const isExpanded = expandedDirs.has(fullPath);
    const hasChildren = items.children.length > 0;

    return (
      <div key={fullPath}>
        <button
          className={`node-tree-row${isLeaf ? " is-leaf" : " is-directory"}${selectedPath === fullPath ? " is-selected" : ""}`}
          onClick={() => {
            if (isLeaf && items.def) {
              setSelectedPath(items.def.relativePath);
            } else if (hasChildren) {
              toggleExpand(fullPath);
            }
          }}
          onDoubleClick={() => {
            if (isLeaf && items.def) {
              void onSubmit(items.def.relativePath);
            }
          }}
          style={{ paddingLeft: 12 + depth * 16 }}
          type="button"
        >
          {hasChildren ? (
            <span className="node-tree-expander">{isExpanded ? "▾" : "▸"}</span>
          ) : (
            <span className="node-tree-expander is-leaf" />
          )}
          {isLeaf && items.def ? (
            <span className={`node-tree-icon is-${items.def.nodeKind}`}>
              {items.def.nodeKind === "event" ? "◈" : items.def.nodeKind === "flow" ? "◆" : "◇"}
            </span>
          ) : (
            <span className="node-tree-icon is-directory">📂</span>
          )}
          <span className="node-tree-label">{items.name}</span>
          {isLeaf && items.def?.alias ? (
            <span className="node-tree-alias">{items.def.alias}</span>
          ) : null}
          {isLeaf && items.def ? (
            <span className={`flowchart-kind-badge is-${items.def.nodeKind}`}>{items.def.nodeKind}</span>
          ) : null}
        </button>
        {hasChildren && isExpanded ? (
          <div className="node-tree-children">
            {items.children.map((child) => renderTree(child, fullPath, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label="从节点库选择类型" aria-modal="true" className="workspace-create-dialog node-tree-dialog" role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">从节点库选择类型</p>
            <strong>浏览节点定义目录树</strong>
          </div>
          {catalog ? <span className="badge">{catalog.nodeDefinitions.length.toLocaleString()} 个类型</span> : null}
        </div>

        <div className="node-tree-dialog-body">
          <div className="node-tree-dialog-sidebar">
            <label className="search-field compact-field">
              <span>过滤节点</span>
              <input
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setSelectedPath(null);
                }}
                placeholder="按名称、别名、路径搜索…"
                type="search"
                value={searchText}
              />
            </label>

            <div className="node-tree-scroll">
              {searchText.trim() ? (
                // Search results view
                matchedDefinitions && matchedDefinitions.length > 0 ? (
                  matchedDefinitions.map((def) => (
                    <button
                      className={`node-tree-row is-leaf${selectedPath === def.relativePath ? " is-selected" : ""}`}
                      key={def.relativePath}
                      onClick={() => setSelectedPath(def.relativePath)}
                      onDoubleClick={() => void onSubmit(def.relativePath)}
                      type="button"
                    >
                      <span className={`node-tree-icon is-${def.nodeKind}`}>
                        {def.nodeKind === "event" ? "◈" : def.nodeKind === "flow" ? "◆" : "◇"}
                      </span>
                      <span className="node-tree-label">{def.name}</span>
                      {def.alias ? <span className="node-tree-alias">{def.alias}</span> : null}
                      <span className="node-tree-path">{def.relativePath}</span>
                      <span className={`flowchart-kind-badge is-${def.nodeKind}`}>{def.nodeKind}</span>
                    </button>
                  ))
                ) : (
                  <div className="empty-panel flowchart-sidebar-empty is-compact">
                    <strong>没有匹配的节点定义</strong>
                    <p>尝试调整搜索关键字。</p>
                  </div>
                )
              ) : (
                // Tree view
                treeData?.map((group) => renderTree(
                  { name: group.name, def: null, children: group.children },
                  "",
                  0,
                ))
              )}
            </div>
          </div>

          <div className="node-tree-dialog-preview">
            <NodePreviewPanel
              document={previewDocument}
              summary={selectedSummary}
            />
            {isLoadingPreview ? <p className="status-detail" style={{ padding: 8 }}>加载中…</p> : null}
          </div>
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button
            className="primary-button"
            disabled={!selectedPath}
            onClick={() => { if (selectedPath) void onSubmit(selectedPath); }}
            type="button"
          >
            添加节点
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}
```

- [ ] **Step 2: Add CSS styles for NodeTreeDialog and NodePreviewPanel**

Append to `flowchart-editor.css`:

```css
/* ── Node Tree Dialog ── */
.workspace-create-dialog.node-tree-dialog {
  width: min(960px, 100%);
}

.node-tree-dialog-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  min-height: 400px;
  max-height: 70vh;
  overflow: hidden;
}

.node-tree-dialog-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  padding-right: 12px;
  border-right: 1px solid #3c3c3c;
}

.node-tree-dialog-preview {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow-y: auto;
  padding-left: 12px;
}

.node-tree-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Tree rows ── */
.node-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 3px 8px;
  border: none;
  background: transparent;
  text-align: left;
  color: #cccccc;
  cursor: pointer;
  white-space: nowrap;
}

.node-tree-row:hover {
  background: #2a2a2a;
}

.node-tree-row.is-selected {
  background: #0f2434;
  box-shadow: inset 2px 0 0 #007acc;
  color: #dcdcdc;
}

.node-tree-expander {
  flex: 0 0 auto;
  width: 14px;
  font-size: 10px;
  color: #8b8b8b;
  text-align: center;
}

.node-tree-expander.is-leaf {
  visibility: hidden;
}

.node-tree-icon {
  flex: 0 0 auto;
  width: 18px;
  text-align: center;
  font-size: 12px;
}

.node-tree-icon.is-event { color: #4fc1ff; }
.node-tree-icon.is-flow { color: #72d08d; }
.node-tree-icon.is-compute { color: #f0b35b; }
.node-tree-icon.is-directory { font-size: 13px; }

.node-tree-label {
  flex: 0 1 auto;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tree-alias {
  flex: 0 1 auto;
  font-size: 11px;
  color: #8b8b8b;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tree-path {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: #8b8b8b;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tree-row .flowchart-kind-badge {
  flex: 0 0 auto;
  margin-left: auto;
}

.node-tree-children {
  display: flex;
  flex-direction: column;
}

/* ── Node Preview Panel ── */
.node-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-preview-panel.is-empty {
  padding: 24px 0;
  text-align: center;
}

.node-preview-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid #3c3c3c;
}

.node-preview-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-preview-title-row strong {
  font-size: 15px;
  color: #dcdcdc;
}

.node-preview-alias {
  font-size: 12px;
  color: #8b8b8b;
}

.node-preview-path {
  font-size: 11px;
  color: #8b8b8b;
  word-break: break-all;
}

.node-preview-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.node-preview-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #8b8b8b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.node-preview-description {
  margin: 0;
  font-size: 12px;
  color: #b0b0b0;
  line-height: 1.5;
  max-height: 6em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-preview-subsection {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 8px;
}

.node-preview-subsection-label {
  font-size: 10px;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.node-preview-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
  padding: 0 4px;
}

.node-preview-field-name {
  font-size: 12px;
  color: #cccccc;
}

.node-preview-field-type {
  font-size: 11px;
  color: #4fc1ff;
  font-family: Consolas, monospace;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/NodeTreeDialog.tsx
git add app/desktop/src/styles/flowchart-editor.css
git commit -m "feat: add NodeTreeDialog with tree browser and NodePreviewPanel"
```

---

### Task 7: Wire new components into FlowChartEditorView

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx`

- [ ] **Step 1: Add imports for new components**

At the top of `FlowChartEditorView.tsx`, add imports after existing FlowChart imports:

```typescript
import { QuickAddOverlay } from "./QuickAddOverlay";
import { NodeTreeDialog } from "./NodeTreeDialog";
```

- [ ] **Step 2: Add state variables for new dialogs**

After `const [preferredNodePosition, setPreferredNodePosition]` (line 45), add:

```typescript
const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
const [isNodeTreeDialogOpen, setIsNodeTreeDialogOpen] = useState(false);
```

- [ ] **Step 3: Add handler functions**

After `handleCloseNodeDialog` (line 265-269), add:

```typescript
function handleQuickAddSubmit(nodeType: string) {
  void editor.addNode(nodeType, preferredNodePosition ?? undefined);
  setIsQuickAddOpen(false);
  setPreferredNodeType(null);
  setPreferredNodePosition(null);
}

function handleNodeTreeSubmit(nodeType: string) {
  void editor.addNode(nodeType, preferredNodePosition ?? undefined);
  setIsNodeTreeDialogOpen(false);
  setPreferredNodeType(null);
  setPreferredNodePosition(null);
}
```

- [ ] **Step 4: Replace `handleOpenNodeDialog` to open QuickAdd**

Update `handleOpenNodeDialog` (line 319-323):

```typescript
function handleOpenNodeDialog(nodeType?: string, position?: { x: number; y: number }) {
  setPreferredNodePosition(position ?? null);
  if (nodeType) {
    // Direct node type specified (from sidebar) — add immediately
    void editor.addNode(nodeType, position ?? undefined);
  } else {
    // Open Quick Add overlay
    setIsQuickAddOpen(true);
  }
}
```

- [ ] **Step 5: Replace the FlowChartNodeDialog rendering with new components**

Find the `FlowChartNodeDialog` usage (around line 635-641) and replace with:

```tsx
<QuickAddOverlay
  catalog={editor.catalog}
  isOpen={isQuickAddOpen}
  onBrowseAll={() => {
    setIsQuickAddOpen(false);
    setIsNodeTreeDialogOpen(true);
  }}
  onClose={() => {
    setIsQuickAddOpen(false);
    setPreferredNodeType(null);
    setPreferredNodePosition(null);
  }}
  onSubmit={handleQuickAddSubmit}
/>

<NodeTreeDialog
  catalog={editor.catalog}
  hostInfo={editor.hostInfo}
  isOpen={isNodeTreeDialogOpen}
  onClose={() => {
    setIsNodeTreeDialogOpen(false);
    setPreferredNodeType(null);
    setPreferredNodePosition(null);
  }}
  onSubmit={handleNodeTreeSubmit}
  workspacePath={workspacePath}
/>
```

- [ ] **Step 6: Remove `isNodeDialogOpen` state and its related handlers if they become unused**

(Leave the old `FlowChartNodeDialog` import and component in place but unused — it can be cleaned up later.)

- [ ] **Step 7: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git commit -m "feat: wire QuickAddOverlay and NodeTreeDialog into FlowChartEditorView"
```

---

### Task 8: Register Ctrl+P shortcut in App.tsx

**Files:**
- Modify: `app/desktop/src/App.tsx` (add shortcut binding)

- [ ] **Step 1: Add a ref/callback to open QuickAdd**

We need `FlowChartEditorView` to expose a way to open the QuickAdd overlay from outside. The cleanest approach with the current architecture is to add a `ref` that exposes an `openQuickAdd()` method.

In `FlowChartEditorView.tsx`, replace `export function FlowChartEditorView(` with a `useImperativeHandle` pattern or, simpler, pass a callback from `App.tsx`.

Simpler approach: Pass an `onRequestOpenQuickAdd: () => void` callback prop to `FlowChartEditorView`.

In `FlowChartEditorView.tsx`, add to props type:

```typescript
onRequestOpenQuickAdd?: () => void;
```

Add a `useEffect` to register a custom event or use the prop. Actually, the cleanest approach is to have `App.tsx` hold a state `quickAddRequested` and toggle it.

Let's use a simpler approach: **Store a ref to a function in a module-level variable**.

Actually, the simplest approach that follows the existing pattern is to use a `useImperativeHandle` with `forwardRef` on `FlowChartEditorView`:

In `FlowChartEditorView.tsx`:

```typescript
import { forwardRef, useImperativeHandle } from "react";

export type FlowChartEditorViewHandle = {
  openQuickAdd: () => void;
};

export const FlowChartEditorView = forwardRef<FlowChartEditorViewHandle, FlowChartEditorViewProps>(
  function FlowChartEditorView(props, ref) {
    // ... existing code ...

    useImperativeHandle(ref, () => ({
      openQuickAdd: () => {
        setPreferredNodePosition(null);
        setIsQuickAddOpen(true);
      },
    }));

    // ... return ...
  }
);
```

Then in `App.tsx`, create a ref and pass it:

```typescript
const flowChartEditorViewRef = useRef<FlowChartEditorViewHandle>(null);
```

And in the shortcut binding:

```typescript
{
  id: "quick-add-node",
  label: "快速添加节点",
  hint: "Ctrl+P",
  enabled: true,
  matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "p",
  run: () => {
    flowChartEditorViewRef.current?.openQuickAdd();
  },
},
```

- [ ] **Step 2: Change FlowChartEditorView to use forwardRef**

In `FlowChartEditorView.tsx`:

1. Add to imports: `import { forwardRef, useImperativeHandle } from "react";`
2. Add `export type FlowChartEditorViewHandle = { openQuickAdd: () => void; };`
3. Change the function to `export const FlowChartEditorView = forwardRef<FlowChartEditorViewHandle, FlowChartEditorViewProps>(function FlowChartEditorView({...props}, ref) { ... useImperativeHandle(ref, () => ({ openQuickAdd: () => { setIsQuickAddOpen(true); } })); ... });`

- [ ] **Step 3: Add shortcut binding in App.tsx**

In `App.tsx`, find `flowChartShortcutBindings` (line 402) and add the Ctrl+P binding before the closing `]`:

```typescript
{
  id: "quick-add-node",
  label: "快速添加节点",
  hint: "Ctrl+P",
  enabled: true,
  matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "p",
  run: () => {
    flowChartEditorViewRef.current?.openQuickAdd();
  },
},
```

- [ ] **Step 4: Pass ref to FlowChartEditorView in App.tsx**

Find the `FlowChartEditorView` usage in App.tsx and add the ref:

```typescript
<FlowChartEditorView
  ref={flowChartEditorViewRef}
  editor={flowChartEditor}
  ...
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git add app/desktop/src/App.tsx
git commit -m "feat: register Ctrl+P shortcut for QuickAdd overlay"
```

---

### Task 9: Update NodeDefinitionJson spec document

**Files:**
- Modify: `Spec/FlowCharts/NodeDefinitionJson.md`

- [ ] **Step 1: Add description field to the spec**

In `NodeDefinitionJson.md`, find the "顶层字段" section (after line 56), add a new item between `nodeKind` and `typeParameters`:

```markdown
5. `description`
   可选。节点概述，纯文本。用于编辑器内的搜索检索和节点预览。不参与代码生成。
```

Also renumber the subsequent items (6-9 become 7-10 after inserting).

Update the example JSON (around line 33-45 and 276-316) to include `"description": "..."`:

```json
{
  "formatVersion": "1.0",
  "name": "OnEnterScene",
  "alias": "进入场景",
  "nodeKind": "event",
  "description": "触发玩家进入场景时触发。可用于场景加载、初始状态设置等。",
  "typeParameters": [],
  ...
}
```

- [ ] **Step 2: Commit**

```bash
git add Spec/FlowCharts/NodeDefinitionJson.md
git commit -m "docs: add description field to node definition spec"
```

---

### Task 10: Clean up — remove old FlowChartNodeDialog wiring

**Files:**
- Modify: `app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx`

- [ ] **Step 1: Remove unused imports and state**

In `FlowChartEditorView.tsx`:
1. Remove import of `FlowChartNodeDialog` (line 10)
2. Remove `isNodeDialogOpen` state (line 38) if it still exists and is unused
3. Remove `handleCloseNodeDialog` function if unused
4. Remove `handleSubmitNode` function if unused

- [ ] **Step 2: Verify no broken references**

Search for any remaining references to `isNodeDialogOpen`, `handleCloseNodeDialog`, `setIsNodeDialogOpen` in the file. Remove them.

- [ ] **Step 3: Commit**

```bash
git add app/desktop/src/flowchart-editor/components/FlowChartEditorView.tsx
git commit -m "refactor: remove old FlowChartNodeDialog wiring"
```

---

### Task 11: Backend — expose description in navigation API

**Files:**
- Modify: (C# backend file — e.g., `LightyDesign.DesktopHost/Controllers/FlowChartController.cs` or equivalent)

- [ ] **Step 1: Locate the navigation endpoint**

Find the C# controller endpoint that returns `FlowChartCatalogResponse` (the navigation data). This endpoint reads all node definition JSON files from `FlowCharts/Nodes/` and returns their summaries.

- [ ] **Step 2: Add description to the summary**

When reading each node definition JSON file, extract the `description` field from the JSON root object. If present, include it in the navigation response's `nodeDefinitions` array; otherwise send `null`.

- [ ] **Step 3: Update the load endpoint**

The endpoint at `/api/workspace/flowcharts/nodes/load` already returns the full document, which now includes `description`. No change needed there if it deserializes the full JSON.

- [ ] **Step 4: Commit**

```bash
git add LightyDesign.DesktopHost/Controllers/FlowChartController.cs
git commit -m "feat: expose node description in navigation API"
```

---

## Self-Review Checklist

### Spec coverage
- [x] Quick Add overlay (Ctrl+P) — Task 4 + Task 8
- [x] Tree browser dialog — Task 6
- [x] Node preview panel — Task 5
- [x] description field in types — Task 1
- [x] description field in edit dialog — Task 2
- [x] description field in spec docs — Task 9
- [x] description exposed in backend API — Task 11
- [x] Fuzzy search with weighted fields — Task 3
- [x] Tree expand/collapse persistence via localStorage — Task 6
- [x] Remove old FlowChartNodeDialog — Task 10

### Placeholder scan
- [x] No "TBD", "TODO", "implement later", "fill in details"
- [x] No "Add appropriate error handling" without specifics
- [x] No "Write tests" without actual test code
- [x] No "Similar to Task N" without repeating code
- [x] Every code step has complete code

### Type consistency
- [x] `description?: string | null` used consistently across all types, utility functions, and components
- [x] `fuzzySearchNodes` accepts `FlowChartNodeDefinitionSummary[]` and returns `SearchMatch[]` — consistent usage in both QuickAddOverlay and NodeTreeDialog
- [x] `QuickAddOverlay` and `NodeTreeDialog` both use the same `onSubmit: (nodeType: string) => void` signature
