import { useMemo, useRef, useState } from "react";

import { NameInputDialog } from "../../components/NameInputDialog";
import { CodegenDialog } from "../../workbook-editor/components/CodegenDialog";

import type { useFlowChartEditor } from "../hooks/useFlowChartEditor";

import { FlowChartCanvas } from "./FlowChartCanvas";
import { FlowChartInspector } from "./FlowChartInspector";
import { FlowChartMetadataDialog } from "./FlowChartMetadataDialog";
import { FlowChartNodeDialog } from "./FlowChartNodeDialog";
import { FlowChartSidebar } from "./FlowChartSidebar";

type FlowChartEditorViewProps = {
  editor: ReturnType<typeof useFlowChartEditor>;
  workspacePath: string;
};

export function FlowChartEditorView({ editor, workspacePath }: FlowChartEditorViewProps) {
  const selectedNodeDefinition = editor.selectedNode ? editor.resolvedDefinitionsByType[editor.selectedNode.nodeType] ?? null : null;
  const [metadataDialogMode, setMetadataDialogMode] = useState<"create" | "edit">("create");
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [isNodeDialogOpen, setIsNodeDialogOpen] = useState(false);
  const [isCodegenDialogOpen, setIsCodegenDialogOpen] = useState(false);
  const [codegenDialogMode, setCodegenDialogMode] = useState<"single" | "batch" | "all">("single");
  const [codegenOutputRelativePath, setCodegenOutputRelativePath] = useState(editor.workspaceCodegenOutputRelativePath ?? "");
  const [codegenTargetPaths, setCodegenTargetPaths] = useState<string[]>([]);
  const codegenOutputInputRef = useRef<HTMLInputElement | null>(null);
  const [preferredNodeType, setPreferredNodeType] = useState<string | null>(null);
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

  async function handleSubmitNode(nodeType: string) {
    await editor.addNode(nodeType);
    setIsNodeDialogOpen(false);
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

  function handleOpenNodeDialog(nodeType?: string) {
    setPreferredNodeType(nodeType ?? null);
    setIsNodeDialogOpen(true);
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

  function handleRequestDeleteFlowChart(relativePath: string, label: string) {
    const shouldDelete = window.confirm(`确认删除流程图 ${label} 吗？该操作不会进入撤销/重做。`);
    if (!shouldDelete) {
      return;
    }

    void editor.deleteFlowChartFile("files", relativePath);
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
        onOpenExportAllFlowChartsDialog={handleOpenExportAllFlowChartsDialog}
        onOpenExportFlowChartDialog={handleOpenExportFlowChartDialog}
        onOpenExportFlowChartDirectoryDialog={handleOpenExportFlowChartDirectoryDialog}
        onOpenFlowChart={editor.selectFlowChart}
        onOpenRenameDirectoryDialog={handleOpenRenameDirectoryDialog}
        onRequestDeleteDirectory={handleRequestDeleteDirectory}
        onRequestDeleteFlowChart={handleRequestDeleteFlowChart}
        onRetryLoad={editor.reloadCatalog}
        workspacePath={workspacePath}
      />

      <main className="workspace-main">
        <section className="editor-panel flowchart-editor-panel">
          <div className="editor-workspace-header flowchart-header-bar">
            <div className="flowchart-header-copy">
              <p className="eyebrow">流程图编辑</p>
              <strong>{activeFlowChartLabel}</strong>
              <span className="status-detail">
                {editor.activeSummary?.relativePath ?? "从左侧 Files / Nodes 根目录开始展开资源树；流程图和目录操作统一通过右键菜单完成。"}
              </span>
            </div>

            <div className="flowchart-header-meta">
              <span className="badge">{editor.catalog?.files.length ?? 0} 图文件</span>
              <span className="badge">{editor.catalog?.fileDirectories.length ?? 0} 文件目录</span>
              <span className="badge">{editor.catalog?.nodeDefinitions.length ?? 0} 节点</span>
              <span className="badge">{editor.catalog?.nodeDirectories.length ?? 0} 节点目录</span>
              <span className={`badge${editor.validationIssues.length > 0 ? " flowchart-badge-error" : ""}`}>
                {editor.validationIssues.length} 问题
              </span>
            </div>
          </div>

          <div className="flowchart-editor-body viewer-panel">
            <div className="flowchart-editor-canvas-panel">
              <FlowChartCanvas
                activeDocument={editor.activeDocument}
                errorMessage={editor.activeFlowChartState.status === "error" ? editor.activeFlowChartState.error : null}
                nodeDefinitionsByType={editor.resolvedDefinitionsByType}
                onBeginConnection={editor.beginConnection}
                onCancelPendingConnection={editor.cancelPendingConnection}
                onClearSelection={editor.clearSelection}
                onCompleteConnection={editor.completePendingConnection}
                onMoveSelectedNodes={editor.moveSelectedNodes}
                onOpenAddNodeDialog={() => handleOpenNodeDialog()}
                onAlignSelectedNodes={editor.alignSelectedNodes}
                onDistributeSelectedNodes={editor.distributeSelectedNodes}
                onAutoLayoutNodes={editor.autoLayoutNodes}
                onSelectConnection={editor.selectConnection}
                onSelectNode={editor.selectNode}
                onSelectNodes={editor.selectNodes}
                pendingConnection={editor.pendingConnection}
                selectedNodeCount={editor.selectedNodeCount}
                selection={editor.selection}
                status={editor.activeFlowChartState.status}
              />
            </div>

            <FlowChartInspector
              activeDocument={editor.activeDocument}
              activeSummary={editor.activeSummary}
              dirty={editor.activeFlowChartState.status === "ready" ? editor.activeFlowChartState.dirty : false}
              onDeleteSelection={editor.deleteSelection}
              onDeleteSelectedConnection={editor.deleteSelectedConnection}
              onDeleteSelectedNode={editor.deleteSelectedNode}
              onOpenMetaDialog={() => handleOpenEditFlowChartDialog(editor.activeSummary?.relativePath)}
              onReload={editor.reloadActiveFlowChart}
              onResetNodePropertyValue={editor.resetNodePropertyValue}
              onSave={editor.saveActiveFlowChart}
              onUpdateNodePropertyValue={editor.updateNodePropertyValue}
              saveError={editor.saveError}
              saveState={editor.saveState}
              selectedConnection={editor.selectedConnectionItem}
              selectedConnectionCount={editor.selectedConnectionCount}
              selectedNode={editor.selectedNode}
              selectedNodeCount={editor.selectedNodeCount}
              selectedNodeDefinition={selectedNodeDefinition}
              validationIssues={editor.validationIssues}
            />
          </div>
        </section>
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

      <FlowChartNodeDialog
        catalog={editor.catalog}
        initialNodeType={preferredNodeType}
        isOpen={isNodeDialogOpen}
        onClose={() => setIsNodeDialogOpen(false)}
        onSubmit={handleSubmitNode}
      />
    </>
  );
}