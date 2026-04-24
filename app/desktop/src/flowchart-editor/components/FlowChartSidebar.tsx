import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import type {
  FlowChartCatalogResponse,
  FlowChartFileSummary,
  FlowChartNodeDefinitionSummary,
} from "../types/flowchartEditor";

type FlowChartTreeScope = "files" | "nodes";

type FlowChartSidebarProps = {
  workspacePath: string;
  catalogStatus: "idle" | "loading" | "ready" | "error";
  catalogError: string | null;
  catalog: FlowChartCatalogResponse | null;
  activeFlowChartPath: string | null;
  canAddNode: boolean;
  onOpenFlowChart: (relativePath: string) => void;
  onAddNode: (relativePath: string) => void | Promise<void>;
  onRetryLoad: () => void;
  onOpenCreateFlowChartDialog: (baseDirectory: string) => void;
  onOpenEditFlowChartDialog: (relativePath: string) => void;
  onOpenCreateDirectoryDialog: (scope: FlowChartTreeScope, baseDirectory: string) => void;
  onOpenRenameDirectoryDialog: (scope: FlowChartTreeScope, relativePath: string) => void;
  onOpenExportFlowChartDialog: (relativePath: string) => void;
  onOpenExportFlowChartDirectoryDialog: (baseDirectory: string) => void;
  onOpenExportAllFlowChartsDialog: () => void;
  onRequestDeleteDirectory: (scope: FlowChartTreeScope, relativePath: string, label: string) => void;
  onRequestDeleteFlowChart: (relativePath: string, label: string) => void;
};

type TreeDirectoryNode = {
  kind: "directory";
  scope: FlowChartTreeScope;
  key: string;
  relativePath: string | null;
  name: string;
  searchText: string;
  isRoot: boolean;
  count: number | null;
  children: TreeEntry[];
};

type TreeFlowChartNode = {
  kind: "flowchart-file";
  scope: "files";
  key: string;
  relativePath: string;
  label: string;
  secondaryLabel: string | null;
  searchText: string;
};

type TreeNodeDefinitionNode = {
  kind: "node-definition";
  scope: "nodes";
  key: string;
  relativePath: string;
  label: string;
  secondaryLabel: string | null;
  nodeKind: string;
  searchText: string;
};

type TreeEntry = TreeDirectoryNode | TreeFlowChartNode | TreeNodeDefinitionNode;

type TreeContextMenuTarget =
  | {
      kind: "directory";
      scope: FlowChartTreeScope;
      relativePath: string | null;
      label: string;
      key: string;
      isRoot: boolean;
      expanded: boolean;
    }
  | {
      kind: "flowchart-file";
      relativePath: string;
      label: string;
    }
  | {
      kind: "node-definition";
      relativePath: string;
      label: string;
    };

function buildFlowChartFileLabel(file: FlowChartFileSummary) {
  return file.alias?.trim() ? `${file.alias} · ${file.name}` : file.name;
}

function buildNodeDefinitionLabel(node: FlowChartNodeDefinitionSummary) {
  return node.alias?.trim() ? `${node.alias} · ${node.name}` : node.name;
}

function buildTreeKey(scope: FlowChartTreeScope, relativePath: string | null) {
  return `${scope}:${relativePath ?? "__root__"}`;
}

function buildSidebarPreferenceKey(workspacePath: string) {
  return `lightydesign.workspacePath:${workspacePath}:flowchart-sidebar-expanded-v1`;
}

function createDirectoryNode(scope: FlowChartTreeScope, relativePath: string | null, name: string, isRoot = false, count: number | null = null): TreeDirectoryNode {
  return {
    kind: "directory",
    scope,
    key: buildTreeKey(scope, relativePath),
    relativePath,
    name,
    searchText: `${name} ${relativePath ?? ""}`.toLowerCase(),
    isRoot,
    count,
    children: [],
  };
}

function ensureDirectory(root: TreeDirectoryNode, scope: FlowChartTreeScope, relativePath: string) {
  if (!relativePath) {
    return root;
  }

  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  let current = root;
  let currentPath = "";

  segments.forEach((segment) => {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    let nextDirectory = current.children.find(
      (candidate): candidate is TreeDirectoryNode => candidate.kind === "directory" && candidate.relativePath === currentPath,
    );
    if (!nextDirectory) {
      nextDirectory = createDirectoryNode(scope, currentPath, segment);
      current.children.push(nextDirectory);
    }

    current = nextDirectory;
  });

  return current;
}

function sortTree(directory: TreeDirectoryNode) {
  directory.children.forEach((child) => {
    if (child.kind === "directory") {
      sortTree(child);
    }
  });

  directory.children.sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") {
      return -1;
    }

    if (left.kind !== "directory" && right.kind === "directory") {
      return 1;
    }

    const leftLabel = left.kind === "directory" ? left.name : left.label;
    const rightLabel = right.kind === "directory" ? right.name : right.label;
    const primary = leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base" });
    if (primary !== 0) {
      return primary;
    }

    const leftPath = left.kind === "directory" ? left.relativePath ?? "" : left.relativePath;
    const rightPath = right.kind === "directory" ? right.relativePath ?? "" : right.relativePath;
    return leftPath.localeCompare(rightPath, undefined, { sensitivity: "base" });
  });
}

function filterTree(entry: TreeEntry, keyword: string): TreeEntry | null {
  if (!keyword) {
    return entry;
  }

  if (entry.kind === "directory") {
    const filteredChildren = entry.children
      .map((child) => filterTree(child, keyword))
      .filter((child): child is TreeEntry => child !== null);
    const matchesSelf = entry.searchText.includes(keyword);
    if (!entry.isRoot && !matchesSelf && filteredChildren.length === 0) {
      return null;
    }

    return {
      ...entry,
      children: filteredChildren,
    };
  }

  return entry.searchText.includes(keyword) ? entry : null;
}

function buildFilesTree(catalog: FlowChartCatalogResponse | null) {
  const root = createDirectoryNode("files", null, "Files", true, catalog?.files.length ?? 0);
  if (!catalog) {
    return root;
  }

  catalog.fileDirectories.forEach((relativePath) => {
    ensureDirectory(root, "files", relativePath);
  });

  catalog.files.forEach((file) => {
    const parentPath = file.relativePath.includes("/") ? file.relativePath.split("/").slice(0, -1).join("/") : "";
    const parent = ensureDirectory(root, "files", parentPath);
    parent.children.push({
      kind: "flowchart-file",
      scope: "files",
      key: buildTreeKey("files", file.relativePath),
      relativePath: file.relativePath,
      label: buildFlowChartFileLabel(file),
      secondaryLabel: file.alias?.trim() ? file.name : null,
      searchText: `${file.relativePath} ${file.name} ${file.alias ?? ""}`.toLowerCase(),
    });
  });

  sortTree(root);
  return root;
}

function buildNodesTree(catalog: FlowChartCatalogResponse | null) {
  const root = createDirectoryNode("nodes", null, "Nodes", true, catalog?.nodeDefinitions.length ?? 0);
  if (!catalog) {
    return root;
  }

  catalog.nodeDirectories.forEach((relativePath) => {
    ensureDirectory(root, "nodes", relativePath);
  });

  catalog.nodeDefinitions.forEach((nodeDefinition) => {
    const parentPath = nodeDefinition.relativePath.includes("/") ? nodeDefinition.relativePath.split("/").slice(0, -1).join("/") : "";
    const parent = ensureDirectory(root, "nodes", parentPath);
    parent.children.push({
      kind: "node-definition",
      scope: "nodes",
      key: buildTreeKey("nodes", nodeDefinition.relativePath),
      relativePath: nodeDefinition.relativePath,
      label: buildNodeDefinitionLabel(nodeDefinition),
      secondaryLabel: nodeDefinition.alias?.trim() ? nodeDefinition.name : null,
      nodeKind: nodeDefinition.nodeKind,
      searchText: `${nodeDefinition.relativePath} ${nodeDefinition.name} ${nodeDefinition.alias ?? ""} ${nodeDefinition.nodeKind}`.toLowerCase(),
    });
  });

  sortTree(root);
  return root;
}

function clampContextMenuPosition(x: number, y: number, width: number, height: number) {
  const margin = 8;
  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, window.innerHeight - height - margin)),
  };
}

export function FlowChartSidebar({
  workspacePath,
  catalogStatus,
  catalogError,
  catalog,
  activeFlowChartPath,
  canAddNode,
  onOpenFlowChart,
  onAddNode,
  onRetryLoad,
  onOpenCreateFlowChartDialog,
  onOpenEditFlowChartDialog,
  onOpenCreateDirectoryDialog,
  onOpenRenameDirectoryDialog,
  onOpenExportFlowChartDialog,
  onOpenExportFlowChartDirectoryDialog,
  onOpenExportAllFlowChartsDialog,
  onRequestDeleteDirectory,
  onRequestDeleteFlowChart,
}: FlowChartSidebarProps) {
  const [searchText, setSearchText] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: TreeContextMenuTarget;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      setExpandedKeys(new Set());
      return;
    }

    try {
      const rawValue = localStorage.getItem(buildSidebarPreferenceKey(workspacePath));
      if (!rawValue) {
        setExpandedKeys(new Set());
        return;
      }

      const parsed = JSON.parse(rawValue) as string[];
      setExpandedKeys(new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []));
    } catch {
      setExpandedKeys(new Set());
    }
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }

    localStorage.setItem(buildSidebarPreferenceKey(workspacePath), JSON.stringify(Array.from(expandedKeys)));
  }, [expandedKeys, workspacePath]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      return;
    }

    const nextPosition = clampContextMenuPosition(
      contextMenu.x,
      contextMenu.y,
      contextMenuRef.current.offsetWidth,
      contextMenuRef.current.offsetHeight,
    );
    if (nextPosition.x !== contextMenu.x || nextPosition.y !== contextMenu.y) {
      setContextMenu((current) => (current ? { ...current, ...nextPosition } : current));
    }
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".tree-context-menu")) {
        return;
      }

      setContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const keyword = searchText.trim().toLowerCase();
  const filesTree = useMemo(() => filterTree(buildFilesTree(catalog), keyword), [catalog, keyword]);
  const nodesTree = useMemo(() => filterTree(buildNodesTree(catalog), keyword), [catalog, keyword]);
  const visibleRoots = [filesTree, nodesTree].filter((root): root is TreeDirectoryNode => root !== null);
  const hasVisibleEntries = visibleRoots.some((root) => root.children.length > 0);
  const isSearchActive = keyword.length > 0;

  function getFlowChartCountInDirectory(relativePath: string | null) {
    if (!catalog) {
      return 0;
    }

    if (!relativePath) {
      return catalog.files.length;
    }

    const prefix = `${relativePath}/`;
    return catalog.files.filter((file) => file.relativePath.startsWith(prefix)).length;
  }

  function toggleDirectory(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function openContextMenu(event: ReactMouseEvent<HTMLElement>, target: TreeContextMenuTarget) {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      target,
    });
  }

  function runMenuAction(action: () => void) {
    setContextMenu(null);
    action();
  }

  function renderTreeEntry(entry: TreeEntry, depth: number) {
    if (entry.kind === "directory") {
      const isExpanded = isSearchActive || expandedKeys.has(entry.key);
      return (
        <div className="flowchart-tree-branch" key={entry.key}>
          <button
            className={`flowchart-tree-row flowchart-tree-row-directory${entry.isRoot ? " is-root" : ""}`}
            onClick={() => toggleDirectory(entry.key)}
            onContextMenu={(event) => {
              openContextMenu(event, {
                kind: "directory",
                scope: entry.scope,
                relativePath: entry.relativePath,
                label: entry.relativePath ?? entry.name,
                key: entry.key,
                isRoot: entry.isRoot,
                expanded: expandedKeys.has(entry.key),
              });
            }}
            style={{ paddingLeft: 10 + depth * 18 }}
            type="button"
          >
            <span className="flowchart-tree-expander">{isExpanded ? "v" : ">"}</span>
            <span className="flowchart-tree-label">{entry.name}</span>
            {entry.count !== null ? <span className="badge">{entry.count}</span> : null}
          </button>

          {isExpanded ? (
            entry.children.length > 0 ? (
              <div className="flowchart-tree-children">
                {entry.children.map((child) => renderTreeEntry(child, depth + 1))}
              </div>
            ) : (
              <div className="flowchart-tree-empty-row" style={{ paddingLeft: 28 + depth * 18 }}>
                空目录
              </div>
            )
          ) : null}
        </div>
      );
    }

    if (entry.kind === "flowchart-file") {
      return (
        <button
          className={`flowchart-tree-row flowchart-tree-row-leaf${activeFlowChartPath === entry.relativePath ? " is-selected" : ""}`}
          key={entry.key}
          onClick={() => onOpenFlowChart(entry.relativePath)}
          onContextMenu={(event) => {
            openContextMenu(event, {
              kind: "flowchart-file",
              relativePath: entry.relativePath,
              label: entry.label,
            });
          }}
          style={{ paddingLeft: 10 + depth * 18 }}
          type="button"
        >
          <span className="flowchart-tree-expander is-leaf">-</span>
          <span className="flowchart-tree-copy">
            <strong>{entry.label}</strong>
            {entry.secondaryLabel ? <span>{entry.secondaryLabel}</span> : null}
          </span>
          {activeFlowChartPath === entry.relativePath ? <span className="badge">打开中</span> : null}
        </button>
      );
    }

    return (
      <button
        className={`flowchart-tree-row flowchart-tree-row-leaf${canAddNode ? "" : " is-disabled"}`}
        key={entry.key}
        onClick={() => {
          if (canAddNode) {
            void onAddNode(entry.relativePath);
          }
        }}
        onContextMenu={(event) => {
          openContextMenu(event, {
            kind: "node-definition",
            relativePath: entry.relativePath,
            label: entry.label,
          });
        }}
        style={{ paddingLeft: 10 + depth * 18 }}
        type="button"
      >
        <span className="flowchart-tree-expander is-leaf">-</span>
        <span className="flowchart-tree-copy">
          <strong>{entry.label}</strong>
          {entry.secondaryLabel ? <span>{entry.secondaryLabel}</span> : null}
        </span>
        <span className={`flowchart-kind-badge is-${entry.nodeKind}`}>{entry.nodeKind}</span>
      </button>
    );
  }

  return (
    <aside className="workspace-sidebar">
      <section className="sidebar-section tree-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">FlowChartEditor</p>
            <strong>{workspacePath ? "流程图资源树" : "尚未打开工作区"}</strong>
          </div>
          {catalog ? <span className="badge">{catalog.files.length + catalog.nodeDefinitions.length} 项</span> : null}
        </div>

        <label className="search-field compact-field">
          <span>搜索</span>
          <input
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="按名称、别名、路径或节点种类过滤"
            type="search"
            value={searchText}
          />
        </label>

        {catalogStatus === "loading" ? (
          <div className="empty-panel flowchart-sidebar-empty">
            <strong>正在读取流程图导航</strong>
            <p>准备 Files / Nodes 目录树。</p>
          </div>
        ) : null}

        {catalogStatus === "error" ? (
          <div className="empty-panel is-error flowchart-sidebar-empty">
            <strong>流程图导航加载失败</strong>
            <p>{catalogError ?? "未能读取 FlowCharts 目录。"}</p>
            <button className="secondary-button" onClick={onRetryLoad} type="button">
              重试
            </button>
          </div>
        ) : null}

        {catalogStatus === "ready" && !catalog ? (
          <div className="empty-panel flowchart-sidebar-empty">
            <strong>当前没有流程图导航数据</strong>
            <p>请先打开一个工作区。</p>
          </div>
        ) : null}

        {catalogStatus === "ready" && catalog ? (
          <>
            <div className="flowchart-sidebar-tree">
              {visibleRoots.map((root) => renderTreeEntry(root, 0))}
            </div>

            {isSearchActive && !hasVisibleEntries ? (
              <div className="empty-panel flowchart-sidebar-empty is-compact">
                <strong>没有匹配的流程图或节点</strong>
                <p>尝试调整搜索关键字。</p>
              </div>
            ) : null}

            {!isSearchActive && catalog.files.length === 0 && catalog.nodeDefinitions.length === 0 && catalog.fileDirectories.length === 0 && catalog.nodeDirectories.length === 0 ? (
              <div className="empty-panel flowchart-sidebar-empty is-compact">
                <strong>Files / Nodes 目录目前为空</strong>
                <p>右键根目录即可新建流程图或子目录。</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {contextMenu ? (
        <div className="tree-context-menu" ref={contextMenuRef} style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.target.kind === "directory" ? (
            <>
              {!isSearchActive ? (
                <button
                  className="tree-context-menu-item"
                  onClick={() => runMenuAction(() => toggleDirectory(contextMenu.target.key))}
                  type="button"
                >
                  {contextMenu.target.expanded ? "折叠目录" : "展开目录"}
                </button>
              ) : null}

              {contextMenu.target.scope === "files" ? (
                <button
                  className="tree-context-menu-item"
                  onClick={() => runMenuAction(() => onOpenCreateFlowChartDialog(contextMenu.target.relativePath ?? ""))}
                  type="button"
                >
                  新建流程图
                </button>
              ) : null}

              {contextMenu.target.scope === "files" ? (
                contextMenu.target.isRoot ? (
                  <button
                    className="tree-context-menu-item"
                    disabled={getFlowChartCountInDirectory(null) === 0}
                    onClick={() => runMenuAction(() => onOpenExportAllFlowChartsDialog())}
                    type="button"
                  >
                    导出全部代码
                  </button>
                ) : (
                  <button
                    className="tree-context-menu-item"
                    disabled={getFlowChartCountInDirectory(contextMenu.target.relativePath) === 0}
                    onClick={() => runMenuAction(() => onOpenExportFlowChartDirectoryDialog(contextMenu.target.relativePath ?? ""))}
                    type="button"
                  >
                    导出目录代码
                  </button>
                )
              ) : null}

              <button
                className="tree-context-menu-item"
                onClick={() => runMenuAction(() => onOpenCreateDirectoryDialog(contextMenu.target.scope, contextMenu.target.relativePath ?? ""))}
                type="button"
              >
                新建目录
              </button>

              {!contextMenu.target.isRoot ? (
                <button
                  className="tree-context-menu-item"
                  onClick={() => runMenuAction(() => onOpenRenameDirectoryDialog(contextMenu.target.scope, contextMenu.target.relativePath ?? ""))}
                  type="button"
                >
                  重命名目录
                </button>
              ) : null}

              {!contextMenu.target.isRoot ? (
                <button
                  className="tree-context-menu-item is-danger"
                  onClick={() => runMenuAction(() => onRequestDeleteDirectory(contextMenu.target.scope, contextMenu.target.relativePath ?? "", contextMenu.target.label))}
                  type="button"
                >
                  删除目录
                </button>
              ) : null}
            </>
          ) : null}

          {contextMenu.target.kind === "flowchart-file" ? (
            <>
              <button
                className="tree-context-menu-item"
                onClick={() => runMenuAction(() => onOpenFlowChart(contextMenu.target.relativePath))}
                type="button"
              >
                打开流程图
              </button>
              <button
                className="tree-context-menu-item"
                onClick={() => runMenuAction(() => onOpenEditFlowChartDialog(contextMenu.target.relativePath))}
                type="button"
              >
                重命名 / 编辑元信息
              </button>
              <button
                className="tree-context-menu-item"
                onClick={() => runMenuAction(() => onOpenExportFlowChartDialog(contextMenu.target.relativePath))}
                type="button"
              >
                导出流程图代码
              </button>
              <button
                className="tree-context-menu-item is-danger"
                onClick={() => runMenuAction(() => onRequestDeleteFlowChart(contextMenu.target.relativePath, contextMenu.target.label))}
                type="button"
              >
                删除流程图
              </button>
            </>
          ) : null}

          {contextMenu.target.kind === "node-definition" ? (
            <button
              className="tree-context-menu-item"
              disabled={!canAddNode}
              onClick={() => runMenuAction(() => {
                if (canAddNode) {
                  void onAddNode(contextMenu.target.relativePath);
                }
              })}
              type="button"
            >
              添加到当前流程图
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}