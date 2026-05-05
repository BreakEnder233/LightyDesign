import { useCallback, useEffect, useMemo, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";
import { fuzzySearchNodes } from "../utils/fuzzySearch";
import { NodePreviewPanel } from "./NodePreviewPanel";
import type { FlowChartCatalogResponse, FlowChartNodeDefinitionDocument, FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";
import { fetchJson } from "../../utils/desktopHost";

type TreeNode = {
  name: string;
  def?: FlowChartNodeDefinitionSummary | null;
  children: TreeNode[];
};

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
  const root: TreeNode[] = [];

  for (const def of definitions) {
    const segments = def.relativePath.split("/");

    // Find or create first-level group
    let firstLevel = root.find((g) => g.name === segments[0]);
    if (!firstLevel) {
      const newLevel: TreeNode = { name: segments[0], children: [] };
      root.push(newLevel);
      firstLevel = newLevel;
    }

    const level: TreeNode = firstLevel;

    if (segments.length === 1) {
      // Direct child of first level
      level.children.push({ name: def.name, def, children: [] });
    } else {
      // Nested — find/create the leaf under first level
      let current = level.children;
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;
        const existing = current.find((c) => c.name === seg);
        if (existing) {
          if (isLast) {
            existing.def = def;
          }
          current = existing.children;
        } else {
          const newNode = { name: seg, def: isLast ? def : null, children: [] as TreeNode[] };
          current.push(newNode);
          current = newNode.children;
        }
      }
    }
  }

  // Sort each level: directories before leaves, then alphabetically
  function sortChildren(children: TreeNode[]) {
    children.sort((a, b) => {
      if (a.children.length > 0 && !b.children.length) return -1;
      if (!a.children.length && b.children.length > 0) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of children) {
      if (child.children.length > 0) {
        sortChildren(child.children);
      }
    }
  }

  root.sort((a, b) => a.name.localeCompare(b.name));
  for (const group of root) {
    sortChildren(group.children);
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
    items: TreeNode,
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
