import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { NameInputDialog } from "../../components/NameInputDialog";
import { CodegenDialog } from "../../workbook-editor/components/CodegenDialog";

import type { useFlowChartEditor } from "../hooks/useFlowChartEditor";

import { FlowChartCanvas, type FlowChartCanvasHandle } from "./FlowChartCanvas";
import { FlowChartMetadataDialog } from "./FlowChartMetadataDialog";
import { QuickAddOverlay } from "./QuickAddOverlay";
import { NodeTreeDialog } from "./NodeTreeDialog";
import { FlowChartSidebar } from "./FlowChartSidebar";
import { FlowChartInspectorPanel } from "./FlowChartInspectorPanel";
import { FlowChartNodeDefinitionDialog, type NodeDefinitionDialogMode } from "./FlowChartNodeDefinitionDialog";
import { fetchJson } from "../../utils/desktopHost";
import type { TypeMetadataResponse } from "../../workbook-editor/types/desktopApp";
import type { FlowChartNodeDefinitionDocument } from "../types/flowchartEditor";

export type FlowChartEditorViewHandle = {
  openQuickAdd: () => void;
};

type FlowChartEditorViewProps = {
  editor: ReturnType<typeof useFlowChartEditor>;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onSidebarWidthCommit: (width: number) => void;
  workspacePath: string;
  /** Called when the user opens or creates a flowchart, to create a tab in the unified tab bar. */
  onOpenFlowChartTab?: (relativePath: string, name: string) => void;
};

export const FlowChartEditorView = forwardRef<FlowChartEditorViewHandle, FlowChartEditorViewProps>(function FlowChartEditorView({
  editor,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  sidebarWidth,
  workspacePath,
  onOpenFlowChartTab,
}: FlowChartEditorViewProps, ref) {
  const [metadataDialogMode, setMetadataDialogMode] = useState<"create" | "edit">("create");
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isNodeTreeDialogOpen, setIsNodeTreeDialogOpen] = useState(false);
  const [isCodegenDialogOpen, setIsCodegenDialogOpen] = useState(false);
  const [codegenDialogMode, setCodegenDialogMode] = useState<"single" | "batch" | "all">("single");
  const [codegenOutputRelativePath, setCodegenOutputRelativePath] = useState(editor.workspaceCodegenOutputRelativePath ?? "");
  const [codegenTargetPaths, setCodegenTargetPaths] = useState<string[]>([]);
  const codegenOutputInputRef = useRef<HTMLInputElement | null>(null);
  const [preferredNodeType, setPreferredNodeType] = useState<string | null>(null);
  const [preferredNodePosition, setPreferredNodePosition] = useState<{ x: number; y: number } | null>(null);
  const [metadataDialogTarget, setMetadataDialogTarget] = useState<{
    previousRelativePath: string | null;
    relativePath: string;
    name: string;
    alias: string;
  } | null>(null);
  const [directoryDialogState, setDirectoryDialogState] = useState<
    | {
        mode: "create" | "rename";
        scope: "files" | "nodes";
        value: string;
        pathLabel: string;
        pathValue: string;
      }
    | null
  >(null);

  const [isNodeDefinitionDialogOpen, setIsNodeDefinitionDialogOpen] = useState(false);
  const [nodeDefinitionDialogMode, setNodeDefinitionDialogMode] = useState<NodeDefinitionDialogMode>("create");
  const [nodeDefinitionDialogRelativePath, setNodeDefinitionDialogRelativePath] = useState("");
  const [nodeDefinitionDialogExisting, setNodeDefinitionDialogExisting] = useState<FlowChartNodeDefinitionDocument | null>(null);
  const [nodeDefinitionDialogExistingPath, setNodeDefinitionDialogExistingPath] = useState<string | null>(null);
  const [typeMetadata, setTypeMetadata] = useState<TypeMetadataResponse | null>(null);

  const canvasRef = useRef<FlowChartCanvasHandle | null>(null);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);
  const [toolbarZoom, setToolbarZoom] = useState(1);

  useImperativeHandle(ref, () => ({
    openQuickAdd: () => {
      setPreferredNodePosition(null);
      setIsQuickAddOpen(true);
    },
  }));

  // Load type metadata for node definition dialog
  useEffect(() => {
    if (!editor.hostInfo || !workspacePath) {
      setTypeMetadata(null);
      return;
    }

    let cancelled = false;
    void fetchJson<TypeMetadataResponse>(
      `${editor.hostInfo.desktopHostUrl}/api/workspace/type-metadata?workspacePath=${encodeURIComponent(workspacePath)}`,
    )
      .then((response) => {
        if (!cancelled) setTypeMetadata(response);
      })
      .catch(() => {
        if (!cancelled) setTypeMetadata(null);
      });

    return () => { cancelled = true; };
  }, [editor.hostInfo, workspacePath]);

  const suggestedCreateRelativePath = useMemo(() => {
    const baseDirectory = editor.activeFlowChartPath?.includes("/") ? editor.activeFlowChartPath.split("/").slice(0, -1).join("/") : "";
    const existingPaths = new Set(editor.catalog?.files.map((file) => file.relativePath) ?? []);
    let index = 1;

    while (true) {
      const baseName = index === 1 ? "NewFlowChart" : `NewFlowChart${index}`;
      const candidate = baseDirectory ? `${baseDirectory}/${baseName}` : baseName;
      if (!existingPaths.has(candidate)) {
        return candidate;
      }

      index += 1;
    }
  }, [editor.activeFlowChartPath, editor.catalog?.files]);

  const activeFlowChartLabel = editor.activeDocument?.alias
    ?? editor.activeDocument?.name
    ?? editor.activeSummary?.alias
    ?? editor.activeSummary?.name
    ?? "未打开流程图";
  const hasActiveDocument = Boolean(editor.activeDocument && editor.activeSummary);
  const isDirty = editor.activeFlowChartState.status === "ready" ? editor.activeFlowChartState.dirty : false;
  const validationSummary = editor.validationIssues.length === 0 ? "结构校验通过" : `${editor.validationIssues.length} 个阻断问题`;

  function buildSuggestedCreateRelativePath(baseDirectory: string) {
    const existingPaths = new Set(editor.catalog?.files.map((file) => file.relativePath) ?? []);
    let index = 1;

    while (true) {
      const baseName = index === 1 ? "NewFlowChart" : `NewFlowChart${index}`;
      const candidate = baseDirectory ? `${baseDirectory}/${baseName}` : baseName;
      if (!existingPaths.has(candidate)) {
        return candidate;
      }

      index += 1;
    }
  }

  function getFlowChartPathsUnderDirectory(baseDirectory: string) {
    const normalizedBaseDirectory = baseDirectory.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const prefix = normalizedBaseDirectory ? `${normalizedBaseDirectory}/` : "";
    return (editor.catalog?.files ?? [])
      .map((file) => file.relativePath)
      .filter((relativePath) => !normalizedBaseDirectory || relativePath.startsWith(prefix));
  }

  function openCodegenDialog(mode: "single" | "batch" | "all", targetPaths: string[]) {
    setCodegenDialogMode(mode);
    setCodegenTargetPaths(targetPaths);
    setCodegenOutputRelativePath(editor.workspaceCodegenOutputRelativePath ?? "");
    setIsCodegenDialogOpen(true);
  }

  function handleCloseCodegenDialog() {
    setIsCodegenDialogOpen(false);
    setCodegenDialogMode("single");
    setCodegenTargetPaths([]);
  }

  function handleOpenExportFlowChartDialog(relativePath: string) {
    openCodegenDialog("single", [relativePath]);
  }

  function handleOpenExportFlowChartDirectoryDialog(baseDirectory: string) {
    const relativePaths = getFlowChartPathsUnderDirectory(baseDirectory);
    if (relativePaths.length === 0) {
      return;
    }

    openCodegenDialog(relativePaths.length === 1 ? "single" : "batch", relativePaths);
  }

  function handleOpenExportAllFlowChartsDialog() {
    const relativePaths = editor.catalog?.files.map((file) => file.relativePath) ?? [];
    if (relativePaths.length === 0) {
      return;
    }

    openCodegenDialog("all", relativePaths);
  }

  async function handleChooseCodegenOutputDirectory() {
    const selectedPath = await editor.chooseCodegenOutputDirectory();
    if (selectedPath) {
      setCodegenOutputRelativePath(selectedPath);
    }
  }

  async function handleSaveWorkspaceCodegenConfig() {
    const saved = await editor.saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (saved) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportSingleFlowChartCode() {
    const targetPath = codegenTargetPaths[0];
    if (!targetPath) {
      return;
    }

    const saved = await editor.saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await editor.exportFlowChartCode(targetPath);
    if (exported) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportBatchFlowChartCode() {
    if (codegenTargetPaths.length === 0) {
      return;
    }

    const saved = await editor.saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await editor.exportFlowChartBatchCode(codegenTargetPaths);
    if (exported) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportAllFlowChartCode() {
    const saved = await editor.saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await editor.exportAllFlowChartCode();
    if (exported) {
      handleCloseCodegenDialog();
    }
  }

  async function handleSubmitMetadata(value: { relativePath: string; name: string; alias?: string | null }) {
    if (metadataDialogMode === "create") {
      const created = await editor.createFlowChart(value);
      if (created) {
        onOpenFlowChartTab?.(value.relativePath, value.name);
        setMetadataDialogTarget(null);
        setIsMetadataDialogOpen(false);
      }
      return;
    }

    const saved = await editor.saveFlowChartMetadata({
      previousRelativePath: metadataDialogTarget?.previousRelativePath ?? value.relativePath,
      relativePath: value.relativePath,
      name: value.name,
      alias: value.alias ?? null,
    });
    if (saved) {
      setMetadataDialogTarget(null);
      setIsMetadataDialogOpen(false);
    }
  }

  async function handleQuickAddSubmit(nodeType: string) {
    await editor.addNode(nodeType, preferredNodePosition ?? undefined);
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

  async function handleSubmitDirectoryDialog() {
    if (!directoryDialogState) {
      return;
    }

    const succeeded = directoryDialogState.mode === "create"
      ? await editor.createFlowChartDirectory(directoryDialogState.scope, directoryDialogState.value)
      : await editor.renameFlowChartDirectory(directoryDialogState.scope, directoryDialogState.pathValue, directoryDialogState.value);

    if (succeeded) {
      setDirectoryDialogState(null);
    }
  }

  function handleOpenCreateFlowChartDialog(baseDirectory = "") {
    const relativePath = buildSuggestedCreateRelativePath(baseDirectory);
    setMetadataDialogMode("create");
    setMetadataDialogTarget({
      previousRelativePath: null,
      relativePath,
      name: relativePath.split("/").at(-1) ?? "",
      alias: "",
    });
    setIsMetadataDialogOpen(true);
  }

  function handleOpenEditFlowChartDialog(relativePath?: string) {
    const targetPath = relativePath ?? editor.activeSummary?.relativePath ?? null;
    if (!targetPath) {
      return;
    }

    const summary = editor.catalog?.files.find((file) => file.relativePath === targetPath)
      ?? (editor.activeSummary?.relativePath === targetPath ? editor.activeSummary : null);
    if (!summary) {
      return;
    }

    setMetadataDialogMode("edit");
    setMetadataDialogTarget({
      previousRelativePath: summary.relativePath,
      relativePath: summary.relativePath,
      name: summary.name,
      alias: summary.alias ?? "",
    });
    setIsMetadataDialogOpen(true);
  }

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

  function handleOpenCreateDirectoryDialog(scope: "files" | "nodes", baseDirectory: string) {
    const suggestedPath = baseDirectory ? `${baseDirectory}/NewFolder` : "NewFolder";
    setDirectoryDialogState({
      mode: "create",
      scope,
      value: suggestedPath,
      pathLabel: scope === "files" ? "父目录" : "节点库目录",
      pathValue: baseDirectory || (scope === "files" ? "Files" : "Nodes"),
    });
  }

  function handleOpenRenameDirectoryDialog(scope: "files" | "nodes", relativePath: string) {
    setDirectoryDialogState({
      mode: "rename",
      scope,
      value: relativePath,
      pathLabel: scope === "files" ? "当前目录" : "当前节点目录",
      pathValue: relativePath,
    });
  }

  function handleRequestDeleteDirectory(scope: "files" | "nodes", relativePath: string, label: string) {
    const shouldDelete = window.confirm(`确认删除目录 ${label} 吗？该操作会递归删除其下所有内容，且不会进入撤销/重做。`);
    if (!shouldDelete) {
      return;
    }

    void editor.deleteFlowChartDirectory(scope, relativePath);
  }

  function handleMoveFile(scope: "files" | "nodes", relativePath: string, newRelativePath: string) {
    void editor.moveFlowChartFile(scope, relativePath, newRelativePath);
  }

  function handleMoveDirectory(scope: "files" | "nodes", relativePath: string, newRelativePath: string) {
    void editor.moveFlowChartDirectory(scope, relativePath, newRelativePath);
  }

  function handleRequestDeleteFlowChart(relativePath: string, label: string) {
    const shouldDelete = window.confirm(`确认删除流程图 ${label} 吗？该操作不会进入撤销/重做。`);
    if (!shouldDelete) {
      return;
    }

    void editor.deleteFlowChartFile("files", relativePath);
  }

  function handleOpenCreateNodeDefinition(baseDirectory: string) {
    const suggestedName = baseDirectory ? `${baseDirectory}/NewNode` : "NewNode";
    setNodeDefinitionDialogMode("create");
    setNodeDefinitionDialogRelativePath(suggestedName);
    setNodeDefinitionDialogExisting(null);
    setNodeDefinitionDialogExistingPath(null);
    setIsNodeDefinitionDialogOpen(true);
  }

  function handleOpenEditNodeDefinition(relativePath: string) {
    // 从 catalog 和现有加载的 definitions 中找到文档
    const definitionResponse = editor.nodeDefinitionsByPath[relativePath];
    if (definitionResponse?.document) {
      setNodeDefinitionDialogMode("edit");
      setNodeDefinitionDialogRelativePath(relativePath);
      setNodeDefinitionDialogExisting(definitionResponse.document);
      setNodeDefinitionDialogExistingPath(relativePath);
      setIsNodeDefinitionDialogOpen(true);
      return;
    }

    // 使用 loadNodeDefinition
    void editor.loadNodeDefinition(relativePath).then((response) => {
      if (response?.document) {
        setNodeDefinitionDialogMode("edit");
        setNodeDefinitionDialogRelativePath(relativePath);
        setNodeDefinitionDialogExisting(response.document);
        setNodeDefinitionDialogExistingPath(relativePath);
        setIsNodeDefinitionDialogOpen(true);
      }
    });
  }

  async function handleNodeDefinitionSubmit(
    relativePath: string,
    document: FlowChartNodeDefinitionDocument,
  ): Promise<boolean> {
    const saved = await editor.saveNodeDefinition(relativePath, document);
    if (saved) {
      setIsNodeDefinitionDialogOpen(false);
      editor.reloadNodeDefinitions();
    }
    return saved;
  }

  return (
    <>
      <FlowChartSidebar
        activeFlowChartPath={editor.activeFlowChartPath}
        canAddNode={editor.activeFlowChartState.status === "ready"}
        catalog={editor.catalog}
        catalogError={editor.catalogError}
        catalogStatus={editor.catalogStatus}
        onAddNode={(nodeType) => handleOpenNodeDialog(nodeType)}
        onOpenCreateDirectoryDialog={handleOpenCreateDirectoryDialog}
        onOpenCreateFlowChartDialog={handleOpenCreateFlowChartDialog}
        onOpenEditFlowChartDialog={handleOpenEditFlowChartDialog}
        onOpenCreateNodeDefinition={handleOpenCreateNodeDefinition}
        onOpenEditNodeDefinition={handleOpenEditNodeDefinition}
        onOpenExportAllFlowChartsDialog={handleOpenExportAllFlowChartsDialog}
        onOpenExportFlowChartDialog={handleOpenExportFlowChartDialog}
        onOpenExportFlowChartDirectoryDialog={handleOpenExportFlowChartDirectoryDialog}
        onOpenFlowChart={(relativePath) => {
          editor.selectFlowChart(relativePath);
          const name = relativePath.split("/").pop()?.replace(/\.json$/i, "") ?? relativePath;
          onOpenFlowChartTab?.(relativePath, name);
        }}
        onMoveFile={handleMoveFile}
        onMoveDirectory={handleMoveDirectory}
        onOpenRenameDirectoryDialog={handleOpenRenameDirectoryDialog}
        onSidebarWidthChange={onSidebarWidthChange}
        onSidebarWidthCommit={onSidebarWidthCommit}
        onRequestDeleteDirectory={handleRequestDeleteDirectory}
        onRequestDeleteFlowChart={handleRequestDeleteFlowChart}
        onRetryLoad={editor.reloadCatalog}
        sidebarWidth={sidebarWidth}
        workspacePath={workspacePath}
      />

      <main className="workspace-main">
        <div className="flowchart-editor-layout">
          <section className="editor-panel flowchart-editor-panel">
          <div className="flowchart-header-bar">
            <div className="flowchart-header-copy">
              <p className="eyebrow">流程图编辑</p>
              <strong>{activeFlowChartLabel}</strong>
              {hasActiveDocument ? (
                <span className={`badge${isDirty ? " flowchart-badge-dirty" : ""}`}>
                  {editor.saveState === "saving" ? "保存中" : isDirty ? "未保存" : "已同步"}
                </span>
              ) : null}
              {editor.validationIssues.length > 0 ? (
                <span className="badge flowchart-badge-error">
                  {editor.validationIssues.length} 个问题
                </span>
              ) : null}
            </div>

            <div className="flowchart-header-actions">
              {hasActiveDocument ? (
                <>
                  <button className="secondary-button" onClick={() => handleOpenEditFlowChartDialog(editor.activeSummary?.relativePath)} type="button">
                    元信息
                  </button>
                  <button className="primary-button" disabled={editor.saveState === "saving"} onClick={() => {
                    void editor.saveActiveFlowChart();
                  }} type="button">
                    {editor.saveState === "saving" ? "保存中" : "保存"}
                  </button>
                  <button className="secondary-button" onClick={() => {
                    void editor.reloadActiveFlowChart();
                  }} type="button">
                    重新加载
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="flowchart-editor-body viewer-panel">
            {/* ── Canvas toolbar ── */}
            <div className="flowchart-canvas-toolbar">
              <div className="flowchart-canvas-toolbar-group">
                <button className="flowchart-canvas-toolbar-action" disabled={true} title="撤销 (Ctrl+Z)" type="button">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4 3L1 7l3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1 7h8a3 3 0 010 6h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className="flowchart-canvas-toolbar-action" disabled={true} title="重做 (Ctrl+Shift+Z)" type="button">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M10 3l3 4-3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M13 7H5a3 3 0 010 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              <div className="flowchart-canvas-toolbar-separator" />

              <div className="flowchart-canvas-toolbar-group">
                <button className="flowchart-canvas-toolbar-action" onClick={() => canvasRef.current?.zoomOut()} title="缩小" type="button">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                <span className="flowchart-zoom-label">
                  {Math.round(toolbarZoom * 100)}%
                </span>
                <button className="flowchart-canvas-toolbar-action" onClick={() => canvasRef.current?.zoomIn()} title="放大" type="button">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M7 3v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                <button className="flowchart-canvas-toolbar-action" onClick={() => canvasRef.current?.zoomToFit()} title="适应画布" type="button">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="flowchart-editor-canvas-panel" ref={canvasPanelRef}>
              <FlowChartCanvas
                ref={canvasRef}
                activeDocument={editor.activeDocument}
                documentKey={editor.activeFlowChartPath}
                errorMessage={editor.activeFlowChartState.status === "error" ? editor.activeFlowChartState.error : null}
                nodeDefinitionsByType={editor.resolvedDefinitionsByType}
                onBeginConnection={editor.beginConnection}
                onCancelPendingConnection={editor.cancelPendingConnection}
                onClearSelection={editor.clearSelection}
                onCompleteConnection={editor.completePendingConnection}
                onDeleteSelection={editor.deleteSelection}
                onDisconnectPort={editor.disconnectPort}
                onPushUndoEntry={editor.pushUndoEntry}
                onMoveSelectedNodes={editor.moveSelectedNodes}
                onOpenAddNodeDialog={(position) => handleOpenNodeDialog(undefined, position)}
                onAlignSelectedNodes={editor.alignSelectedNodes}
                onDistributeSelectedNodes={editor.distributeSelectedNodes}
                onAutoLayoutNodes={editor.autoLayoutNodes}
                onSelectConnection={editor.selectConnection}
                onSelectNode={editor.selectNode}
                onSelectNodes={editor.selectNodes}
                onViewTransformChange={(transform) => {
                  setToolbarZoom(transform.zoom);
                }}
                pendingConnection={editor.pendingConnection}
                selectedNodeCount={editor.selectedNodeCount}
                selection={editor.selection}
                status={editor.activeFlowChartState.status}
                onDropNodeDefinition={(nodeType, position) => {
                  const zoom = canvasRef.current?.getZoom() ?? 1;
                  const viewOrigin = canvasRef.current?.getViewOrigin() ?? { x: 0, y: 0 };
                  const canvasX = Math.max(0, Math.round(position.x / zoom + viewOrigin.x));
                  const canvasY = Math.max(0, Math.round(position.y / zoom + viewOrigin.y));
                  void editor.addNode(nodeType, { x: canvasX, y: canvasY });
                }}
              />
            </div>
          </div>
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


      <FlowChartMetadataDialog
        initialAlias={metadataDialogTarget?.alias ?? ""}
        initialName={metadataDialogTarget?.name ?? (metadataDialogMode === "create" ? (suggestedCreateRelativePath.split("/").at(-1) ?? "") : "")}
        initialRelativePath={metadataDialogTarget?.relativePath ?? suggestedCreateRelativePath}
        isOpen={isMetadataDialogOpen}
        mode={metadataDialogMode}
        onClose={() => {
          setMetadataDialogTarget(null);
          setIsMetadataDialogOpen(false);
        }}
        onSubmit={handleSubmitMetadata}
      />

      <CodegenDialog
        bridgeError={null}
        canChooseWorkspaceDirectory={Boolean(window.lightyDesign?.chooseWorkspaceDirectory)}
        inputRef={codegenOutputInputRef}
        isOpen={isCodegenDialogOpen}
        mode={codegenDialogMode}
        onChooseOutputDirectory={handleChooseCodegenOutputDirectory}
        onClose={handleCloseCodegenDialog}
        onExportAll={handleExportAllFlowChartCode}
        onExportBatch={handleExportBatchFlowChartCode}
        onExportSingle={handleExportSingleFlowChartCode}
        onOutputPathChange={setCodegenOutputRelativePath}
        onSaveConfig={handleSaveWorkspaceCodegenConfig}
        outputRelativePath={codegenOutputRelativePath}
        subjectLabel="流程图"
        workspacePath={workspacePath}
      />

      <NameInputDialog
        ariaLabel={directoryDialogState?.mode === "create" ? "新建流程图目录" : "重命名流程图目录"}
        inputLabel={directoryDialogState?.mode === "create" ? "目录路径" : "新的目录路径"}
        isOpen={directoryDialogState !== null}
        onChange={(value) => {
          setDirectoryDialogState((current) => (current ? { ...current, value } : current));
        }}
        onClose={() => setDirectoryDialogState(null)}
        onSubmit={handleSubmitDirectoryDialog}
        pathLabel={directoryDialogState?.pathLabel}
        pathValue={directoryDialogState?.pathValue}
        placeholder={directoryDialogState?.scope === "files" ? "例如 Quest/Main" : "例如 Event/Player"}
        submitLabel={directoryDialogState?.mode === "create" ? "创建目录" : "保存目录"}
        title={directoryDialogState?.mode === "create" ? "新建目录" : "重命名目录"}
        value={directoryDialogState?.value ?? ""}
      />

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

      <FlowChartNodeDefinitionDialog
        existingDefinition={nodeDefinitionDialogExisting}
        existingRelativePath={nodeDefinitionDialogExistingPath}
        initialRelativePath={nodeDefinitionDialogRelativePath}
        isOpen={isNodeDefinitionDialogOpen}
        mode={nodeDefinitionDialogMode}
        onClose={() => setIsNodeDefinitionDialogOpen(false)}
        onSubmit={handleNodeDefinitionSubmit}
        onResolveType={async (type) => {
          if (!editor.hostInfo || !workspacePath) {
            return { ok: false, message: "工作区未就绪" };
          }
          try {
            return await fetchJson<{ ok: boolean; normalizedType?: string; message?: string }>(
              `${editor.hostInfo.desktopHostUrl}/api/workspace/type-validation?type=${encodeURIComponent(type)}&workspacePath=${encodeURIComponent(workspacePath)}`,
            );
          } catch {
            return { ok: false, message: "类型校验失败" };
          }
        }}
        typeMetadata={typeMetadata}
      />
    </>
  );
});