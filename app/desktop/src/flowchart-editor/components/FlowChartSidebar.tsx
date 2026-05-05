import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import type {
  FlowChartCatalogResponse,
  FlowChartFileSummary,
  FlowChartNodeDefinitionSummary,
} from "../types/flowchartEditor";

import { TreeView } from "./tree-view/TreeView";
import { TreeViewIcon } from "./tree-view/TreeViewIcon";
import { TreeViewSearchHighlighter } from "./tree-view/TreeViewSearchHighlighter";
import type { TreeViewItem, DropTarget, DragPayload } from "./tree-view/treeViewUtils";
import { computeSearchRanges } from "./tree-view/treeViewUtils";

type FlowChartTreeScope = "files" | "nodes";

type FlowChartSidebarProps = {
  workspacePath: string;
  sidebarWidth: number;
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
  onSidebarWidthChange: (width: number) => void;
  onSidebarWidthCommit: (width: number) => void;
  onRequestDeleteDirectory: (scope: FlowChartTreeScope, relativePath: string, label: string) => void;
  onRequestDeleteFlowChart: (relativePath: string, label: string) => void;
  onMoveFile?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
  onMoveDirectory?: (scope: "files" | "nodes", relativePath: string, newRelativePath: string) => void;
  onOpenCreateNodeDefinition?: (baseDirectory: string) => void;
  onOpenEditNodeDefinition?: (relativePath: string) => void;
};

type FlowChartSidebarTab = "files" | "nodes";

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
  searchText: string;
};

type TreeNodeDefinitionNode = {
  kind: "node-definition";
  scope: "nodes";
  key: string;
  relativePath: string;
  label: string;
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
  return file.alias?.trim() || file.name;
}

function buildNodeDefinitionLabel(node: FlowChartNodeDefinitionSummary) {
  return node.alias?.trim() || node.name;
}

function buildTreeKey(scope: FlowChartTreeScope, relativePath: string | null) {
  return `${scope}:${relativePath ?? "__root__"}`;
}

function buildSidebarPreferenceKey(workspacePath: string) {
  return `lightydesign.workspacePath:${workspacePath}:flowchart-sidebar-expanded-v1`;
}

const minSidebarWidth = 220;
const maxSidebarWidth = 520;

function clampSidebarWidth(width: number) {
  return Math.min(maxSidebarWidth, Math.max(minSidebarWidth, Math.round(width)));
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

function buildFlatItems(
  root: TreeDirectoryNode,
  expandedKeys: Set<string>,
  keyword: string,
): TreeViewItem[] {
  const result: TreeViewItem[] = [];
  const isSearchActive = keyword.length > 0;

  function walk(entry: TreeEntry, depth: number) {
    if (entry.kind === "directory") {
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
      const label = entry.label;
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

function buildFilesTree(catalog: FlowChartCatalogResponse | null) {
  const root = createDirectoryNode("files", null, "流程图", true, catalog?.files.length ?? 0);
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
      searchText: `${file.relativePath} ${file.name} ${file.alias ?? ""}`.toLowerCase(),
    });
  });

  sortTree(root);
  return root;
}

function buildNodesTree(catalog: FlowChartCatalogResponse | null) {
  const root = createDirectoryNode("nodes", null, "节点", true, catalog?.nodeDefinitions.length ?? 0);
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
  sidebarWidth,
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
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onRequestDeleteDirectory,
  onRequestDeleteFlowChart,
  onMoveFile,
  onMoveDirectory,
  onOpenCreateNodeDefinition,
  onOpenEditNodeDefinition,
}: FlowChartSidebarProps) {
  const [activeTab, setActiveTab] = useState<FlowChartSidebarTab>("files");
  const [filesSearchText, setFilesSearchText] = useState("");
  const [nodesSearchText, setNodesSearchText] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: TreeContextMenuTarget;
  } | null>(null);
  const [resizeState, setResizeState] = useState<{
    startX: number;
    startWidth: number;
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

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      onSidebarWidthChange(clampSidebarWidth(resizeState.startWidth + event.clientX - resizeState.startX));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const nextWidth = clampSidebarWidth(resizeState.startWidth + event.clientX - resizeState.startX);
      onSidebarWidthChange(nextWidth);
      onSidebarWidthCommit(nextWidth);
      setResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onSidebarWidthChange, onSidebarWidthCommit, resizeState]);

  const filesKeyword = filesSearchText.trim().toLowerCase();
  const nodesKeyword = nodesSearchText.trim().toLowerCase();
  const filesTree = useMemo(() => filterTree(buildFilesTree(catalog), filesKeyword), [catalog, filesKeyword]);
  const nodesTree = useMemo(() => filterTree(buildNodesTree(catalog), nodesKeyword), [catalog, nodesKeyword]);
  const activeKeyword = activeTab === "files" ? filesKeyword : nodesKeyword;
  const activeSearchText = activeTab === "files" ? filesSearchText : nodesSearchText;
  const activeTree = activeTab === "files" ? filesTree : nodesTree;
  const activeTreeDir = useMemo(() => {
    const tree = activeTab === "files" ? filesTree : nodesTree;
    return tree?.kind === "directory" ? tree : null;
  }, [activeTab, filesTree, nodesTree]);
  const hasVisibleEntries = Boolean(activeTreeDir && activeTreeDir.children.length > 0);
  const isSearchActive = activeKeyword.length > 0;
  const selectedKey = useMemo<string | null>(() => {
    if (!activeFlowChartPath) return null;
    return buildTreeKey("files", activeFlowChartPath);
  }, [activeFlowChartPath]);
  const flatItems = useMemo(() => {
    if (!activeTreeDir) return [];
    return buildFlatItems(activeTreeDir, expandedKeys, activeKeyword);
  }, [activeTreeDir, expandedKeys, activeKeyword]);

  function setActiveSearchText(value: string) {
    if (activeTab === "files") {
      setFilesSearchText(value);
      return;
    }

    setNodesSearchText(value);
  }

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

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setResizeState({
      startX: event.clientX,
      startWidth: sidebarWidth,
    });
  }

  const handleTreeDrop = useCallback(
    (source: DragPayload, target: DropTarget) => {
      if (source.keys.length !== 1 || !activeTreeDir) return;
      const sourceKey = source.keys[0];
      const sourceEntry = findEntryByKey(activeTreeDir, sourceKey);
      if (!sourceEntry) return;

      if (target.kind === "directory") {
        const targetEntry = findEntryByKey(activeTreeDir, target.targetKey);
        if (!targetEntry || targetEntry.kind !== "directory") return;

        const sourcePath = "relativePath" in sourceEntry ? sourceEntry.relativePath : null;
        const targetDirPath = targetEntry.relativePath ?? "";
        const sourceName = sourceEntry.kind === "directory"
          ? sourceEntry.name
          : sourceEntry.label;
        const newRelativePath = targetDirPath ? `${targetDirPath}/${sourceName}` : sourceName;

        if (!sourcePath || sourcePath === newRelativePath) return;

        if (sourceEntry.kind === "directory") {
          onMoveDirectory?.(sourceEntry.scope, sourcePath, newRelativePath);
        } else if (sourceEntry.kind === "flowchart-file") {
          onMoveFile?.("files", sourcePath, newRelativePath);
        } else if (sourceEntry.kind === "node-definition") {
          onMoveFile?.("nodes", sourcePath, newRelativePath);
        }
      }
    },
    [activeTreeDir, onMoveFile, onMoveDirectory],
  );

  return (
    <aside className="workspace-sidebar flowchart-workspace-sidebar">
      <section className="sidebar-section tree-card flowchart-sidebar-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">FlowChartEditor</p>
            <strong>{workspacePath ? "流程图资源" : "尚未打开工作区"}</strong>
          </div>
          {catalog ? <span className="badge">{catalog.files.length + catalog.nodeDefinitions.length} 项</span> : null}
        </div>

        <div aria-label="流程图资源分页" className="flowchart-sidebar-tabbar" role="tablist">
          <button
            aria-selected={activeTab === "files"}
            className={`flowchart-sidebar-tab-button${activeTab === "files" ? " is-active" : ""}`}
            onClick={() => setActiveTab("files")}
            role="tab"
            type="button"
          >
            <span>流程图树</span>
            <span className="badge">{catalog?.files.length ?? 0}</span>
          </button>
          <button
            aria-selected={activeTab === "nodes"}
            className={`flowchart-sidebar-tab-button${activeTab === "nodes" ? " is-active" : ""}`}
            onClick={() => setActiveTab("nodes")}
            role="tab"
            type="button"
          >
            <span>节点树</span>
            <span className="badge">{catalog?.nodeDefinitions.length ?? 0}</span>
          </button>
        </div>

        <div className="flowchart-sidebar-tabpanel" role="tabpanel">
          <label className="search-field compact-field">
            <span>{activeTab === "files" ? "搜索流程图" : "搜索节点"}</span>
            <input
              onChange={(event) => setActiveSearchText(event.target.value)}
              placeholder={activeTab === "files" ? "按名称、别名或路径过滤流程图" : "按名称、别名、路径或节点种类过滤"}
              type="search"
              value={activeSearchText}
            />
          </label>

          <div className="flowchart-sidebar-tree-shell">
            {catalogStatus === "loading" ? (
              <div className="empty-panel flowchart-sidebar-empty">
                <strong>正在读取流程图导航</strong>
                <p>准备{activeTab === "files" ? "流程图树" : "节点树"}。</p>
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
                  <div className="flowchart-sidebar-tree-content">
                    {activeTreeDir ? (
                      <TreeView
                        items={flatItems}
                        expandedKeys={expandedKeys}
                        selectedKey={selectedKey}
                        dragEnabled={!isSearchActive}
                        onToggle={toggleDirectory}
                        onSelect={(key) => {
                          const entry = findEntryByKey(activeTreeDir, key);
                          if (!entry) return;
                          if (entry.kind === "flowchart-file") {
                            onOpenFlowChart(entry.relativePath);
                          } else if (entry.kind === "node-definition" && canAddNode) {
                            void onAddNode(entry.relativePath);
                          }
                        }}
                        onContextMenu={(event, item) => {
                          const entry = findEntryByKey(activeTreeDir, item.id);
                          if (!entry) return;
                          if (entry.kind === "directory") {
                            openContextMenu(event as ReactMouseEvent<HTMLElement>, {
                              kind: "directory",
                              scope: entry.scope,
                              relativePath: entry.relativePath,
                              label: entry.relativePath ?? entry.name,
                              key: entry.key,
                              isRoot: entry.isRoot,
                              expanded: expandedKeys.has(entry.key),
                            });
                          } else if (entry.kind === "flowchart-file") {
                            openContextMenu(event as ReactMouseEvent<HTMLElement>, {
                              kind: "flowchart-file",
                              relativePath: entry.relativePath,
                              label: entry.label,
                            });
                          } else if (entry.kind === "node-definition") {
                            openContextMenu(event as ReactMouseEvent<HTMLElement>, {
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
                          const entryKind = item.metadata.kind as string;
                          if (entryKind === "node-definition") {
                            const nodeKind = item.metadata.nodeKind as string;
                            if (nodeKind === "event") return <TreeViewIcon kind="node-definition-event" />;
                            if (nodeKind === "flow") return <TreeViewIcon kind="node-definition-flow" />;
                            if (nodeKind === "compute") return <TreeViewIcon kind="node-definition-compute" />;
                          }
                          return <TreeViewIcon kind="flowchart-file" />;
                        }}
                        renderLabel={(item) => (
                          <TreeViewSearchHighlighter text={item.label} ranges={item.searchRanges} />
                        )}
                        renderBadge={(item) => {
                          if (item.kind === "directory" && item.metadata.count != null) {
                            return <span className="badge">{item.metadata.count as number}</span>;
                          }
                          if (item.kind === "leaf" && item.metadata.nodeKind) {
                            return <span className={`flowchart-kind-badge is-${item.metadata.nodeKind as string}`}>{(item.metadata.nodeKind as string)}</span>;
                          }
                          if (item.kind === "leaf" && activeFlowChartPath && item.metadata.relativePath === activeFlowChartPath) {
                            return <span className="badge flowchart-tree-row-badge">打开中</span>;
                          }
                          return null;
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                {isSearchActive && !hasVisibleEntries ? (
                  <div className="empty-panel flowchart-sidebar-empty is-compact">
                    <strong>没有匹配的{activeTab === "files" ? "流程图" : "节点"}</strong>
                    <p>尝试调整搜索关键字。</p>
                  </div>
                ) : null}

                {!isSearchActive && activeTab === "files" && catalog.files.length === 0 && catalog.fileDirectories.length === 0 ? (
                  <div className="empty-panel flowchart-sidebar-empty is-compact">
                    <strong>流程图树目前为空</strong>
                    <p>右键根目录即可新建流程图或子目录。</p>
                  </div>
                ) : null}

                {!isSearchActive && activeTab === "nodes" && catalog.nodeDefinitions.length === 0 && catalog.nodeDirectories.length === 0 ? (
                  <div className="empty-panel flowchart-sidebar-empty is-compact">
                    <strong>节点树目前为空</strong>
                    <p>右键根目录即可新建目录，再导入或生成节点定义。</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </section>

      {contextMenu ? (
        <div className="tree-context-menu" ref={contextMenuRef} style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.target.kind === "directory"
            ? (() => {
                const target = contextMenu.target;
                if (target.kind !== "directory") {
                  return null;
                }

                return (
                  <>
                    {!isSearchActive ? (
                      <button className="tree-context-menu-item" onClick={() => runMenuAction(() => toggleDirectory(target.key))} type="button">
                        {target.expanded ? "折叠目录" : "展开目录"}
                      </button>
                    ) : null}

                    {target.scope === "files" ? (
                      <button
                        className="tree-context-menu-item"
                        onClick={() => runMenuAction(() => onOpenCreateFlowChartDialog(target.relativePath ?? ""))}
                        type="button"
                      >
                        新建流程图
                      </button>
                    ) : null}

                    {target.scope === "files"
                      ? target.isRoot
                        ? (
                            <button
                              className="tree-context-menu-item"
                              disabled={getFlowChartCountInDirectory(null) === 0}
                              onClick={() => runMenuAction(() => onOpenExportAllFlowChartsDialog())}
                              type="button"
                            >
                              导出全部代码
                            </button>
                          )
                        : (
                            <button
                              className="tree-context-menu-item"
                              disabled={getFlowChartCountInDirectory(target.relativePath) === 0}
                              onClick={() => runMenuAction(() => onOpenExportFlowChartDirectoryDialog(target.relativePath ?? ""))}
                              type="button"
                            >
                              导出目录代码
                            </button>
                          )
                      : null}

                    {target.scope === "nodes" && onOpenCreateNodeDefinition ? (
                      <button
                        className="tree-context-menu-item"
                        onClick={() => runMenuAction(() => onOpenCreateNodeDefinition(target.relativePath ?? ""))}
                        type="button"
                      >
                        新建节点定义
                      </button>
                    ) : null}

                    <button
                      className="tree-context-menu-item"
                      onClick={() => runMenuAction(() => onOpenCreateDirectoryDialog(target.scope, target.relativePath ?? ""))}
                      type="button"
                    >
                      新建目录
                    </button>

                    {!target.isRoot ? (
                      <button
                        className="tree-context-menu-item"
                        onClick={() => runMenuAction(() => onOpenRenameDirectoryDialog(target.scope, target.relativePath ?? ""))}
                        type="button"
                      >
                        重命名目录
                      </button>
                    ) : null}

                    {!target.isRoot ? (
                      <button
                        className="tree-context-menu-item is-danger"
                        onClick={() => runMenuAction(() => onRequestDeleteDirectory(target.scope, target.relativePath ?? "", target.label))}
                        type="button"
                      >
                        删除目录
                      </button>
                    ) : null}
                  </>
                );
              })()
            : null}

          {contextMenu.target.kind === "flowchart-file"
            ? (() => {
                const target = contextMenu.target;
                if (target.kind !== "flowchart-file") {
                  return null;
                }

                return (
                  <>
                    <button className="tree-context-menu-item" onClick={() => runMenuAction(() => onOpenFlowChart(target.relativePath))} type="button">
                      打开流程图
                    </button>
                    <button
                      className="tree-context-menu-item"
                      onClick={() => runMenuAction(() => onOpenEditFlowChartDialog(target.relativePath))}
                      type="button"
                    >
                      重命名 / 编辑元信息
                    </button>
                    <button
                      className="tree-context-menu-item"
                      onClick={() => runMenuAction(() => onOpenExportFlowChartDialog(target.relativePath))}
                      type="button"
                    >
                      导出流程图代码
                    </button>
                    <button
                      className="tree-context-menu-item is-danger"
                      onClick={() => runMenuAction(() => onRequestDeleteFlowChart(target.relativePath, target.label))}
                      type="button"
                    >
                      删除流程图
                    </button>
                  </>
                );
              })()
            : null}

          {contextMenu.target.kind === "node-definition"
            ? (() => {
                const target = contextMenu.target;
                if (target.kind !== "node-definition") {
                  return null;
                }

                return (
                  <>
                    {onOpenEditNodeDefinition ? (
                      <button
                        className="tree-context-menu-item"
                        onClick={() => runMenuAction(() => onOpenEditNodeDefinition(target.relativePath))}
                        type="button"
                      >
                        编辑定义
                      </button>
                    ) : null}
                    <button
                      className="tree-context-menu-item"
                      disabled={!canAddNode}
                      onClick={() => runMenuAction(() => {
                        if (canAddNode) {
                          void onAddNode(target.relativePath);
                        }
                      })}
                      type="button"
                    >
                      添加到当前流程图
                    </button>
                  </>
                );
              })()
            : null}
        </div>
      ) : null}

      <button
        aria-label="调整流程图侧栏宽度"
        className={`flowchart-sidebar-resize-handle${resizeState ? " is-dragging" : ""}`}
        onPointerDown={handleResizePointerDown}
        type="button"
      />
    </aside>
  );
}
