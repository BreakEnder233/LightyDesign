import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DialogBackdrop } from "./components/DialogBackdrop";
import { McpConfigDialog } from "./components/McpConfigDialog";
import { NameInputDialog } from "./components/NameInputDialog";
import { ToastCenter } from "./components/ToastCenter";
import { FlowChartEditorView } from "./flowchart-editor/components/FlowChartEditorView";
import { useFlowChartEditor } from "./flowchart-editor/hooks/useFlowChartEditor";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useDesktopHostConnection } from "./hooks/useDesktopHostConnection";
import { isShortcutModifierPressed, useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useToastCenter } from "./hooks/useToastCenter";
import { WorkbookEditorOverlays } from "./workbook-editor/components/WorkbookEditorOverlays";
import { WorkbookEditorView } from "./workbook-editor/components/WorkbookEditorView";
import { useWorkbookEditorUi } from "./workbook-editor/hooks/useWorkbookEditorUi";
import { useWorkspaceEditor } from "./workbook-editor/hooks/useWorkspaceEditor";
import type { ShortcutBinding } from "./workbook-editor/types/desktopApp";
import {
  buildVsCodeMcpConfigJson,
  formatByteSize,
  getMcpRuntimeStatusLabel,
  normalizeMcpConfigPath,
} from "./utils/appHelpers";
import { fetchJson } from "./utils/desktopHost";

type ToolbarMenuId = "file" | "edit" | "table" | "ai" | "help";
type McpConfigTargetClient = "vscode";
type EditorMode = "workbook" | "flowchart";

function App() {
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const { bridgeStatus, bridgeError, hostInfo, hostHealth } = useDesktopHostConnection();
  const {
    toastNotifications,
    selectedErrorToast,
    setHoveredToastId,
    setSelectedErrorToastId,
    pushToastNotification,
    openToastDetail,
    dismissToast,
    copySelectedErrorDetail,
  } = useToastCenter();
  const { updateInfo, updateResult, updateStatus, updateDownloadState, checkForUpdates, installUpdate } = useAppUpdates({
    bridgeStatus,
    onToast: pushToastNotification,
  });

  const workspaceEditor = useWorkspaceEditor({
    hostInfo,
    onToast: pushToastNotification,
  });
  const {
    workspacePath,
    workspace,
    headerPropertySchemas,
    typeMetadata,
    workspaceStatus,
    workspaceError,
    workspaceSearch,
    setWorkspaceSearch,
    activeTabId,
    sheetFilter,
    setSheetFilter,
    workbookTree,
    activeTab,
    activeSheetState,
    activeSheetData,
    activeSheetColumns,
    activeSheetRows,
    activeWorkbookDirtyTabs,
    filteredRowEntries,
    hasDirtyChanges,
    openSheet,
    chooseParentDirectoryForWorkspaceCreation,
    createWorkspace,
    deleteWorkbook,
    saveWorkspaceCodegenOptions,
    validateWorkbookCode,
    chooseWorkspaceDirectory,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    updateCellValue,
    activateWorkbook,
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
  } = workspaceEditor;

  const hostStatusLabel = bridgeStatus === "unavailable" ? "桥接不可用" : hostHealth?.ok ? "已连接" : "连接中";
  const hostStatusClassName = bridgeStatus === "unavailable" ? "status-chip is-error" : hostHealth?.ok ? "status-chip is-ok" : "status-chip is-warn";
  const canChooseWorkspaceDirectory = bridgeStatus === "ready";
  const [editorMode, setEditorMode] = useState<EditorMode>("workbook");
  const isWorkbookMode = editorMode === "workbook";
  const isFlowChartMode = editorMode === "flowchart";
  const isUpdateInstallInProgress =
    updateDownloadState?.status === "preparing" ||
    updateDownloadState?.status === "downloading" ||
    updateDownloadState?.status === "launching";
  const canInstallUpdate =
    bridgeStatus === "ready" &&
    (isUpdateInstallInProgress || updateResult?.status === "available");
  const updateDownloadProgressText =
    updateDownloadState?.bytesReceived && updateDownloadState.totalBytes
      ? `${formatByteSize(updateDownloadState.bytesReceived)} / ${formatByteSize(updateDownloadState.totalBytes)}`
      : formatByteSize(updateDownloadState?.bytesReceived) ?? null;
  const installButtonLabel =
    updateDownloadState?.status === "downloading"
      ? `下载中 ${updateDownloadState.progressPercent ?? 0}%`
      : updateDownloadState?.status === "preparing"
        ? "准备下载"
        : updateDownloadState?.status === "launching"
          ? "静默安装中"
          : "静默安装";
  const canUseNativeWindowControls = Boolean(window.lightyDesign?.windowControls);
  const updateStatusText =
    bridgeStatus !== "ready"
      ? "不可用"
      : updateDownloadState?.status === "preparing"
        ? "准备下载"
        : updateDownloadState?.status === "downloading"
          ? `下载中 ${updateDownloadState.progressPercent ?? 0}%`
          : updateDownloadState?.status === "launching"
            ? "正在静默安装"
            : updateDownloadState?.status === "cancelled"
              ? "已取消下载"
              : updateDownloadState?.status === "error"
                ? "下载安装失败"
                : updateStatus === "checking"
                  ? "检查中"
                  : updateStatus === "available"
                    ? `可更新到 ${updateResult?.latestVersion ?? "latest"}`
                    : updateStatus === "up-to-date"
                      ? `已是最新 ${updateResult?.currentVersion ?? updateInfo?.currentVersion ?? ""}`.trim()
                      : updateStatus === "unconfigured"
                        ? "未配置更新源"
                        : updateStatus === "error"
                          ? "检查失败"
                          : updateInfo?.currentVersion ?? "待检查";
  const [isCreateWorkspaceDialogOpen, setIsCreateWorkspaceDialogOpen] = useState(false);
  const [createWorkspaceParentDirectoryPath, setCreateWorkspaceParentDirectoryPath] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("NewWorkspace");
  const [isDotnetMissingModalOpen, setIsDotnetMissingModalOpen] = useState(false);
  const [isMcpConfigDialogOpen, setIsMcpConfigDialogOpen] = useState(false);
  const [mcpConfigTargetClient, setMcpConfigTargetClient] = useState<McpConfigTargetClient | null>(null);
  const [mcpConfigPortInput, setMcpConfigPortInput] = useState("");
  const [mcpConfigPathInput, setMcpConfigPathInput] = useState("/mcp");
  const [mcpConfigErrorMessage, setMcpConfigErrorMessage] = useState<string | null>(null);
  const [isSavingMcpConfiguration, setIsSavingMcpConfiguration] = useState(false);
  const [isStartingMcpFromDialog, setIsStartingMcpFromDialog] = useState(false);
  const mcpConfigTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<ToolbarMenuId | null>(null);
  const [mcpPreferences, setMcpPreferences] = useState<McpPreferences | null>(null);
  const flowChartEditor = useFlowChartEditor({
    hostInfo,
    workspacePath,
    bridgeError,
    workspaceCodegenOutputRelativePath: workspace?.codegen.outputRelativePath ?? "",
    onSaveWorkspaceCodegenOptions: saveWorkspaceCodegenOptions,
    onToast: pushToastNotification,
  });
  const {
    activeColumnWidths,
    activeEditorContext,
    appliedFreezeColumnCount,
    appliedFreezeRowCount,
    canCreateSheet,
    canEditActiveSheet,
    canRedoActiveSheet,
    canSaveActiveWorkbook,
    canUndoActiveSheet,
    codegenDialogMode,
    codegenOutputInputRef,
    codegenOutputRelativePath,
    copiedSelectionSnapshot,
    currentSelectionContext,
    currentSheetContext,
    editSheetAliasTarget,
    editSheetAliasValue,
    editingColumn,
    editingColumnIndex,
    editWorkbookAliasTarget,
    editWorkbookAliasValue,
    focusedWorkbook,
    focusedWorkbookName,
    freezeDialogColumnCount,
    freezeDialogRowCount,
    freezeStatusText,
    handleAppendColumn,
    handleAppendRow,
    handleAutoFillSelection,
    handleAutoSizeColumn,
    handleChooseCodegenOutputDirectory,
    handleClearSelectionContents,
    handleCloseColumnEditor,
    handleCloseCodegenDialog,
    handleCloseCreateSheetDialog,
    handleCloseCreateWorkbookDialog,
    handleCloseEditSheetAliasDialog,
    handleCloseEditWorkbookAliasDialog,
    handleCloseFreezeDialog,
    handleCloseRenameSheetDialog,
    handleCloseWorkbookContextMenu,
    handleCloseWorkspace,
    handleConfirmCreateSheet,
    handleConfirmCreateWorkbook,
    handleConfirmEditSheetAlias,
    handleConfirmEditWorkbookAlias,
    handleConfirmExportAllWorkbookCode,
    handleConfirmFreezeDialog,
    handleConfirmRenameSheet,
    handleConvertWorkbookCode,
    handleCopyCurrentSelectionContextJson,
    handleCopyCurrentSheetContextJson,
    handleCopySelection,
    handleCopySelectionToClipboard,
    handleCutSelection,
    handleDeleteColumn,
    handleDeleteRow,
    handleDeleteSheet,
    handleExportAllWorkbookCode,
    handleExportWorkbookCode,
    handleFocusWorkbook,
    handleFormulaBarChange,
    handleInsertColumn,
    handleInsertColumnBefore,
    handleInsertCopiedCellsDown,
    handleInsertCopiedColumns,
    handleInsertCopiedRows,
    handleInsertRow,
    handleInsertRowAbove,
    handleOpenColumnEditor,
    handleOpenCreateSheetDialog,
    handleOpenCreateWorkbookDialog,
    handleOpenEditSheetAliasDialog,
    handleOpenEditWorkbookAliasDialog,
    handleOpenFreezeDialog,
    handleOpenRenameSheetDialog,
    handleOpenSheetContextMenu,
    handleOpenWorkbookContextMenu,
    handlePasteCurrentSelectionFromClipboard,
    handlePasteSelection,
    handlePasteSelectionFromClipboard,
    handleResolveValidationSchema,
    handleResizeColumn,
    handleSaveColumnDefinition,
    handleSaveWorkspaceCodegenConfig,
    handleSelectAll,
    handleSelectCell,
    handleSelectColumn,
    handleSelectRow,
    handleValidateColumnType,
    handleValidateColumnValidationRule,
    isCodegenDialogOpen,
    isCreateSheetDialogOpen,
    isCreateWorkbookDialogOpen,
    isEditSheetAliasDialogOpen,
    isEditWorkbookAliasDialogOpen,
    isFreezeDialogOpen,
    isRenameSheetDialogOpen,
    newSheetName,
    newWorkbookName,
    renameSheetInputRef,
    renameSheetName,
    renameSheetTarget,
    saveStatusText,
    scrollRestoreRequest,
    selectedCell,
    selectedCellAddress,
    selectedCellCount,
    selectedCellDescription,
    selectedCellValue,
    selectionRange,
    selectionStatusText,
    setCodegenOutputRelativePath,
    setEditSheetAliasValue,
    setEditWorkbookAliasValue,
    setFreezeColumnCount,
    setFreezeDialogColumnCount,
    setFreezeDialogRowCount,
    setFreezeRowCount,
    setNewSheetName,
    setNewWorkbookName,
    setRenameSheetName,
    sheetContextMenu,
    sheetContextMenuRef,
    sheetDialogWorkbookName,
    sheetScrollSnapshotsRef,
    workbookContextMenu,
    workbookContextMenuRef,
  } = useWorkbookEditorUi({
    appShellRef,
    bridgeError,
    hostInfo,
    onToast: pushToastNotification,
    shortcutScopeActive: editorMode === "workbook",
    workspaceEditor,
  });

  const flowChartShortcutBindings = useMemo<ShortcutBinding[]>(() => {
    if (editorMode !== "flowchart") {
      return [];
    }

    return [
      {
        id: "save-active-flowchart",
        label: "保存当前流程图",
        hint: "Ctrl+S",
        enabled: flowChartEditor.canSaveActiveFlowChart,
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "s",
        run: () => {
          void flowChartEditor.saveActiveFlowChart();
        },
      },
      {
        id: "select-all-flowchart-nodes",
        label: "选择当前流程图所有节点",
        hint: "Ctrl+A",
        enabled: Boolean(flowChartEditor.activeDocument && flowChartEditor.activeDocument.nodes.length > 0),
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "a",
        run: flowChartEditor.selectAll,
      },
      {
        id: "copy-flowchart-selection",
        label: "复制当前流程图选择",
        hint: "Ctrl+C",
        enabled: flowChartEditor.hasSelection,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "c",
        run: flowChartEditor.copySelection,
      },
      {
        id: "cut-flowchart-selection",
        label: "剪切当前流程图选择",
        hint: "Ctrl+X",
        enabled: flowChartEditor.hasSelection,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "x",
        run: flowChartEditor.cutSelection,
      },
      {
        id: "paste-flowchart-selection",
        label: "粘贴流程图节点副本",
        hint: "Ctrl+V",
        enabled: flowChartEditor.canPasteClipboard,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "v",
        run: flowChartEditor.pasteClipboard,
      },
      {
        id: "delete-selected-flowchart-item",
        label: "删除当前流程图选择",
        hint: "Delete",
        enabled: flowChartEditor.hasSelection,
        matches: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Delete",
        run: flowChartEditor.deleteSelection,
      },
      {
        id: "cancel-pending-flowchart-connection",
        label: "取消当前连线草稿",
        hint: "Escape",
        enabled: Boolean(flowChartEditor.pendingConnection || flowChartEditor.hasSelection),
        matches: (event) => event.key === "Escape",
        run: () => {
          if (flowChartEditor.pendingConnection) {
            flowChartEditor.cancelPendingConnection();
            return;
          }

          flowChartEditor.clearSelection();
        },
      },
    ];
  }, [editorMode, flowChartEditor]);

  useEditorShortcuts(flowChartShortcutBindings);
  const flowChartSelectionText = flowChartEditor.selectedNodeCount > 1
    ? `${flowChartEditor.selectedNodeCount} 个节点`
    : flowChartEditor.selectedConnectionCount > 1
      ? `${flowChartEditor.selectedConnectionCount} 条连线`
      : flowChartEditor.selectedNode
    ? `节点 #${flowChartEditor.selectedNode.nodeId}`
    : flowChartEditor.selectedConnection
      ? "已选中连线"
      : "无选择";
  const flowChartStructureText = flowChartEditor.pendingConnection
    ? "连线草稿进行中"
    : flowChartEditor.validationIssues.length > 0
      ? `${flowChartEditor.validationIssues.length} 个阻断问题`
      : "结构校验通过";
  const flowChartDirtyText = flowChartEditor.activeFlowChartState.status === "ready" && flowChartEditor.activeFlowChartState.dirty
    ? "存在未保存更改"
    : "无未保存更改";

  useEffect(() => {
    if (!hostHealth) {
      return;
    }

    const message = (hostHealth.message ?? "").toLowerCase();
    if (!hostHealth.ok && (message.includes("dotnet") || message.includes(".net") || message.includes("运行库") || message.includes("runtime"))) {
      setIsDotnetMissingModalOpen(true);
    }
  }, [hostHealth]);

  const canCloseWorkspace = Boolean(workspacePath);
  const mcpStatusLabel = getMcpRuntimeStatusLabel(mcpPreferences);
  const parsedMcpConfigPort = Number.parseInt(mcpConfigPortInput.trim(), 10);
  const hasValidMcpConfigPort = Number.isInteger(parsedMcpConfigPort) && parsedMcpConfigPort >= 1024 && parsedMcpConfigPort <= 65535;
  const normalizedMcpConfigPath = normalizeMcpConfigPath(mcpConfigPathInput);
  const mcpConfigPreviewUrl = hasValidMcpConfigPort
    ? `http://${mcpPreferences?.serverHost ?? "127.0.0.1"}:${parsedMcpConfigPort}${normalizedMcpConfigPath}`
    : "";
  const mcpConfigPreviewJson = mcpConfigTargetClient === "vscode" && mcpConfigPreviewUrl
    ? buildVsCodeMcpConfigJson(mcpConfigPreviewUrl)
    : "";

  function handleToolbarMenuHover(menuId: ToolbarMenuId) {
    if (!openToolbarMenu || openToolbarMenu === menuId) {
      return;
    }

    setOpenToolbarMenu(menuId);
  }

  function toggleToolbarMenu(menuId: ToolbarMenuId) {
    setOpenToolbarMenu((current) => (current === menuId ? null : menuId));
  }

  function closeToolbarMenu() {
    setOpenToolbarMenu(null);
  }

  async function handleToggleMcpEnabled() {
    if (!window.lightyDesign?.setMcpEnabled) {
      pushToastNotification({
        title: "MCP 功能不可用",
        detail: "当前运行环境未注入桌面端 MCP 桥接。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    try {
      const shouldEnable = !(mcpPreferences?.enabled ?? false);
      const nextPreferences = await window.lightyDesign.setMcpEnabled(shouldEnable);
      setMcpPreferences(nextPreferences);
      pushToastNotification({
        title: nextPreferences.enabled ? "MCP 服务已开启" : "MCP 服务已关闭",
        detail: nextPreferences.enabled
          ? "新的开启状态已经写入用户偏好，下次启动桌面端时会继续沿用。"
          : "新的关闭状态已经写入用户偏好，下次启动桌面端时会继续沿用。",
        source: "system",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3600,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "无法写入 MCP 偏好。";
      if (window.lightyDesign?.getMcpPreferences) {
        try {
          const latestPreferences = await window.lightyDesign.getMcpPreferences();
          setMcpPreferences(latestPreferences);
        } catch {
          // Ignore refresh failure and fall back to the toast below.
        }
      }

      pushToastNotification({
        title: "更新 MCP 偏好失败",
        detail,
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });

      handleOpenMcpConfigDialog({
        errorMessage: detail,
      });
    }
  }

  function syncMcpConfigDialogForm(preferences: McpPreferences | null) {
    setMcpConfigPortInput(String(preferences?.serverPort ?? 39231));
    setMcpConfigPathInput(preferences?.serverPath ?? "/mcp");
  }

  function handleCloseMcpConfigDialog() {
    setIsMcpConfigDialogOpen(false);
    setMcpConfigTargetClient(null);
    setMcpConfigErrorMessage(null);
    setIsSavingMcpConfiguration(false);
    setIsStartingMcpFromDialog(false);
  }

  function handleOpenMcpConfigDialog(options?: { targetClient?: McpConfigTargetClient | null; errorMessage?: string | null }) {
    if (!window.lightyDesign?.getMcpPreferences) {
      pushToastNotification({
        title: "无法打开 MCP 配置",
        detail: "当前环境没有可用的 MCP 配置桥接。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    setIsMcpConfigDialogOpen(true);
    setMcpConfigTargetClient(options?.targetClient ?? null);
    setMcpConfigErrorMessage(options?.errorMessage ?? null);
    syncMcpConfigDialogForm(mcpPreferences);
  }

  async function handleAutoFindAvailableMcpPort() {
    if (!window.lightyDesign?.findAvailableMcpPort) {
      pushToastNotification({
        title: "无法查找 MCP 端口",
        detail: "当前环境没有可用的 MCP 配置桥接。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    try {
      const result = await window.lightyDesign.findAvailableMcpPort();
      setMcpConfigPortInput(String(result.port));
      setMcpConfigErrorMessage(null);
    } catch (error) {
      pushToastNotification({
        title: "查找 MCP 端口失败",
        detail: error instanceof Error ? error.message : "无法自动找到可用的本地端口。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  async function handleSaveMcpConfiguration() {
    if (!window.lightyDesign?.saveMcpConfiguration) {
      return;
    }

    if (!hasValidMcpConfigPort) {
      setMcpConfigErrorMessage("端口必须是 1024 到 65535 之间的整数。\n");
      return;
    }

    setIsSavingMcpConfiguration(true);
    setMcpConfigErrorMessage(null);

    try {
      const nextPreferences = await window.lightyDesign.saveMcpConfiguration({
        port: parsedMcpConfigPort,
        path: normalizedMcpConfigPath,
      });
      setMcpPreferences(nextPreferences);
      syncMcpConfigDialogForm(nextPreferences);
      pushToastNotification({
        title: "MCP 配置已保存",
        detail: `当前 HTTP 端点将使用 ${nextPreferences.serverUrl}`,
        source: "system",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3600,
      });
    } catch (error) {
      setMcpConfigErrorMessage(error instanceof Error ? error.message : "保存 MCP 配置失败。\n");
    } finally {
      setIsSavingMcpConfiguration(false);
    }
  }

  async function handleStartMcpFromConfigurationDialog() {
    if (!window.lightyDesign?.saveMcpConfiguration || !window.lightyDesign?.setMcpEnabled) {
      return;
    }

    if (!hasValidMcpConfigPort) {
      setMcpConfigErrorMessage("端口必须是 1024 到 65535 之间的整数。\n");
      return;
    }

    setIsStartingMcpFromDialog(true);
    setMcpConfigErrorMessage(null);

    try {
      const savedPreferences = await window.lightyDesign.saveMcpConfiguration({
        port: parsedMcpConfigPort,
        path: normalizedMcpConfigPath,
      });
      const nextPreferences = await window.lightyDesign.setMcpEnabled(true);
      setMcpPreferences(nextPreferences);
      syncMcpConfigDialogForm(nextPreferences);
      pushToastNotification({
        title: "MCP 服务已开启",
        detail: `当前 HTTP 端点 ${nextPreferences.serverUrl} 已可用。`,
        source: "system",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3600,
      });
      handleCloseMcpConfigDialog();
      void savedPreferences;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "MCP 服务启动失败。\n";
      setMcpConfigErrorMessage(detail);
      try {
        const latestPreferences = await window.lightyDesign.getMcpPreferences?.();
        if (latestPreferences) {
          setMcpPreferences(latestPreferences);
        }
      } catch {
        // Ignore refresh failure and keep the dialog open with the current message.
      }
    } finally {
      setIsStartingMcpFromDialog(false);
    }
  }

  function handleSelectMcpConfigTargetClient(targetClient: McpConfigTargetClient) {
    setMcpConfigTargetClient(targetClient);
  }

  async function handleCopyMcpConfigJson() {
    try {
      await navigator.clipboard.writeText(mcpConfigPreviewJson);
    } catch (error) {
      pushToastNotification({
        title: "MCP 配置复制失败",
        detail: error instanceof Error ? error.message : "无法写入剪贴板。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    pushToastNotification({
      title: "MCP 配置已复制",
      detail: "可直接粘贴到 VS Code 的 mcp.json 中。",
      source: "system",
      variant: "success",
      canOpenDetail: false,
      durationMs: 3600,
    });
  }

  function renderToolbarMenuSection(title: string, children: ReactNode) {
    return (
      <div className="toolbar-menu-section" role="presentation">
        <div className="toolbar-menu-section-title">{title}</div>
        <div className="toolbar-menu-section-body">{children}</div>
      </div>
    );
  }

  function renderToolbarMenuItem({
    label,
    shortcut,
    checked = false,
    disabled = false,
    onClick,
  }: {
    label: string;
    shortcut?: string;
    checked?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }) {
    return (
      <button className="toolbar-menu-item" disabled={disabled} onClick={onClick} type="button">
        <span className={`toolbar-menu-check${checked ? " is-visible" : ""}`} aria-hidden="true">✓</span>
        <span className="toolbar-menu-label">{label}</span>
        <span className="toolbar-menu-shortcut">{shortcut ?? ""}</span>
      </button>
    );
  }

  async function handleCopySelectedDetail() {
    const result = await copySelectedErrorDetail();
    if (result.ok) {
      pushToastNotification({
        title: "错误详情已复制",
        detail: `已复制 ${result.title} 的完整错误信息。`,
        source: "system",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3200,
      });
      return;
    }

    pushToastNotification({
      title: "复制错误详情失败",
      detail: result.errorMessage ?? "剪贴板写入失败。",
      source: "system",
      variant: "error",
      canOpenDetail: true,
      durationMs: 8000,
    });
  }

  async function handleRunToastAction(toastId: number) {
    const targetToast = toastNotifications.find((toast) => toast.id === toastId);
    if (!targetToast?.action) {
      return;
    }

    if (targetToast.action.kind === "activate-workbook") {
      if (targetToast.action.workbookName) {
        activateWorkbook(targetToast.action.workbookName);
      }
    }

    if (targetToast.action.kind === "open-directory") {
      if (targetToast.action.directoryPath) {
        const result = await window.lightyDesign?.openDirectory(targetToast.action.directoryPath);
        if (!result?.ok) {
          pushToastNotification({
            title: "打开输出目录失败",
            detail: result?.error ?? `无法打开目录: ${targetToast.action.directoryPath}`,
            source: "system",
            variant: "error",
            canOpenDetail: true,
            durationMs: 8000,
          });
          return;
        }
      }
    }

    if (targetToast.action.kind === "open-external-url") {
      if (targetToast.action.url) {
        const result = await window.lightyDesign?.openExternal(targetToast.action.url);
        if (!result?.ok) {
          pushToastNotification({
            title: "打开链接失败",
            detail: result?.error ?? `无法打开链接: ${targetToast.action.url}`,
            source: "system",
            variant: "error",
            canOpenDetail: true,
            durationMs: 8000,
          });
          return;
        }
      }
    }

    if (targetToast.action.kind === "install-update") {
      await handleInstallUpdate();
    }

    dismissToast(toastId);
  }

  async function handleCheckForUpdates() {
    await checkForUpdates({ manual: true });
  }

  async function handleOpenUpdateRelease() {
    const targetUrl = updateResult?.downloadUrl ?? updateResult?.releasesPageUrl ?? updateInfo?.releasesPageUrl;
    if (!targetUrl) {
      pushToastNotification({
        title: "未找到更新下载地址",
        detail: "当前还没有可用的 Release 页面地址。请先配置 GitHub Releases 更新源。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    const result = await window.lightyDesign?.openExternal(targetUrl);
    if (!result?.ok) {
      pushToastNotification({
        title: "打开发布页失败",
        detail: result?.error ?? `无法打开链接: ${targetUrl}`,
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  async function handleInstallUpdate() {
    const downloadState = await installUpdate({ manual: true });
    if (!downloadState) {
      return;
    }

    if (downloadState.status === "error" && downloadState.releasesPageUrl) {
      pushToastNotification({
        title: "可切换到手动安装",
        summary: "应用内安装失败后，仍可打开发布页手动下载安装包。",
        detail: downloadState.detail ?? downloadState.releasesPageUrl,
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
        action: {
          label: "打开发布页",
          kind: "open-external-url",
          url: downloadState.releasesPageUrl,
        },
      });
    }
  }

  async function handleMinimizeWindow() {
    await window.lightyDesign?.windowControls?.minimize();
  }

  async function handleToggleMaximizeWindow() {
    await window.lightyDesign?.windowControls?.toggleMaximize();
  }

  async function handleCloseWindow() {
    await window.lightyDesign?.windowControls?.close();
  }

  async function handleOpenCreateWorkspaceDialog() {
    const parentDirectoryPath = await chooseParentDirectoryForWorkspaceCreation();
    if (!parentDirectoryPath) {
      return;
    }

    setCreateWorkspaceParentDirectoryPath(parentDirectoryPath);
    setNewWorkspaceName("NewWorkspace");
    setIsCreateWorkspaceDialogOpen(true);
  }

  function handleCloseCreateWorkspaceDialog() {
    setIsCreateWorkspaceDialogOpen(false);
    setCreateWorkspaceParentDirectoryPath("");
    setNewWorkspaceName("NewWorkspace");
  }

  async function handleConfirmCreateWorkspace() {
    const created = await createWorkspace(createWorkspaceParentDirectoryPath, newWorkspaceName);
    if (created) {
      handleCloseCreateWorkspaceDialog();
    }
  }

  async function handleRefreshBuiltinFlowChartNodes() {
    if (!hostInfo || !workspacePath) {
      return;
    }

    try {
      const response = await fetchJson<{ builtinNodeDefinitionCount: number }>(
        `${hostInfo.desktopHostUrl}/api/workspace/template/builtin-nodes/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
          }),
        },
      );

      flowChartEditor.reloadNodeDefinitions();
      flowChartEditor.reloadCatalog();
      pushToastNotification({
        title: "内置节点已更新",
        detail: `已按当前模板刷新 ${response.builtinNodeDefinitionCount} 个内置流程图节点定义。`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
    } catch (error) {
      pushToastNotification({
        title: "更新内置节点失败",
        detail: error instanceof Error ? error.message : "未能按模板刷新内置流程图节点。",
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  useEffect(() => {
    if (!openToolbarMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".app-toolbar-menu-group")) {
        return;
      }

      setOpenToolbarMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenToolbarMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openToolbarMenu]);

  useEffect(() => {
    if (!window.lightyDesign?.getMcpPreferences) {
      return;
    }

    let cancelled = false;

    async function loadMcpPreferences() {
      try {
        const preferences = await window.lightyDesign?.getMcpPreferences();
        if (!cancelled && preferences) {
          setMcpPreferences(preferences);
        }
      } catch {
        if (!cancelled) {
          setMcpPreferences(null);
        }
      }
    }

    void loadMcpPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!window.lightyDesign?.setMcpEditorContext) {
      return;
    }

    void window.lightyDesign.setMcpEditorContext({
      ...activeEditorContext,
      updatedAt: new Date().toISOString(),
      mcpEnabled: mcpPreferences?.enabled ?? false,
    });
  }, [activeEditorContext, mcpPreferences?.enabled]);

  useEffect(() => {
    if (!isMcpConfigDialogOpen || !mcpConfigPreviewJson) {
      return;
    }

    const textarea = mcpConfigTextareaRef.current;
    if (!textarea) {
      return;
    }

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }, [isMcpConfigDialogOpen, mcpConfigPreviewJson]);

  useEffect(() => {
    if (!isMcpConfigDialogOpen) {
      return;
    }

    syncMcpConfigDialogForm(mcpPreferences);
  }, [isMcpConfigDialogOpen, mcpPreferences?.serverPort, mcpPreferences?.serverPath]);

  return (
    <div className="app-shell" ref={appShellRef}>
      <NameInputDialog
        ariaLabel="新建工作区"
        inputLabel="工作区文件夹名称"
        isOpen={isCreateWorkspaceDialogOpen}
        onChange={setNewWorkspaceName}
        onClose={handleCloseCreateWorkspaceDialog}
        onSubmit={handleConfirmCreateWorkspace}
        pathLabel="父目录"
        pathValue={createWorkspaceParentDirectoryPath}
        placeholder="例如 GameData"
        submitLabel="创建并打开"
        title="新建工作区"
        value={newWorkspaceName}
      />

      {isDotnetMissingModalOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={() => setIsDotnetMissingModalOpen(false)}>
          <div
            aria-label="缺少 .NET 运行库"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">检测到缺少 .NET 运行时</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p>未检测到运行 DesktopHost 所需的 .NET 运行库。请安装 .NET 9 运行时后重试。</p>
              <p className="workspace-create-path-value">如果你已安装，请点击“重试”以尝试重新启动后端。</p>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={() => setIsDotnetMissingModalOpen(false)} type="button">
                忽略
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  window.open("https://dotnet.microsoft.com/en-us/download/dotnet/9.0", "_blank");
                }}
                type="button"
              >
                打开 .NET 下载页面
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  try {
                    window.location.reload();
                  } catch {
                    // fallback
                  }
                }}
                type="button"
              >
                重试
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isWorkbookMode ? (
        <WorkbookEditorOverlays
        activeSheetLabel={activeTab ? `${activeTab.workbookName} / ${activeTab.sheetName}` : "尚未打开表格"}
        bridgeError={bridgeError}
        canChooseWorkspaceDirectory={canChooseWorkspaceDirectory}
        codegenDialogMode={codegenDialogMode}
        codegenOutputInputRef={codegenOutputInputRef}
        codegenOutputRelativePath={codegenOutputRelativePath}
        editSheetAliasTarget={editSheetAliasTarget}
        editSheetAliasValue={editSheetAliasValue}
        editWorkbookAliasTarget={editWorkbookAliasTarget}
        editWorkbookAliasValue={editWorkbookAliasValue}
        freezeColumnCount={freezeDialogColumnCount}
        freezeRowCount={freezeDialogRowCount}
        isCodegenDialogOpen={isCodegenDialogOpen}
        isCreateSheetDialogOpen={isCreateSheetDialogOpen}
        isCreateWorkbookDialogOpen={isCreateWorkbookDialogOpen}
        isEditSheetAliasDialogOpen={isEditSheetAliasDialogOpen}
        isEditWorkbookAliasDialogOpen={isEditWorkbookAliasDialogOpen}
        isFreezeDialogOpen={isFreezeDialogOpen}
        isRenameSheetDialogOpen={isRenameSheetDialogOpen}
        newSheetName={newSheetName}
        newWorkbookName={newWorkbookName}
        onChooseCodegenOutputDirectory={handleChooseCodegenOutputDirectory}
        onCloseCodegenDialog={handleCloseCodegenDialog}
        onCloseCreateSheetDialog={handleCloseCreateSheetDialog}
        onCloseCreateWorkbookDialog={handleCloseCreateWorkbookDialog}
        onCloseEditSheetAliasDialog={handleCloseEditSheetAliasDialog}
        onCloseEditWorkbookAliasDialog={handleCloseEditWorkbookAliasDialog}
        onCloseFreezeDialog={handleCloseFreezeDialog}
        onCloseRenameSheetDialog={handleCloseRenameSheetDialog}
        onCloseWorkbookContextMenu={handleCloseWorkbookContextMenu}
        onCodegenOutputPathChange={setCodegenOutputRelativePath}
        onConfirmCreateSheet={handleConfirmCreateSheet}
        onConfirmCreateWorkbook={handleConfirmCreateWorkbook}
        onConfirmEditSheetAlias={handleConfirmEditSheetAlias}
        onConfirmEditWorkbookAlias={handleConfirmEditWorkbookAlias}
        onConfirmExportAllWorkbookCode={handleConfirmExportAllWorkbookCode}
        onConfirmFreezeDialog={handleConfirmFreezeDialog}
        onConfirmRenameSheet={handleConfirmRenameSheet}
        onConvertWorkbookCode={handleConvertWorkbookCode}
        onCreateSheetNameChange={setNewSheetName}
        onCreateWorkbookNameChange={setNewWorkbookName}
        onDeleteSheet={handleDeleteSheet}
        onDeleteWorkbook={async (workbookName) => {
          await deleteWorkbook(workbookName);
        }}
        onEditSheetAliasValueChange={setEditSheetAliasValue}
        onEditWorkbookAliasValueChange={setEditWorkbookAliasValue}
        onExportWorkbookCode={handleExportWorkbookCode}
        onFreezeColumnCountChange={setFreezeDialogColumnCount}
        onFreezeRowCountChange={setFreezeDialogRowCount}
        onOpenCreateSheetDialog={handleOpenCreateSheetDialog}
        onOpenEditSheetAliasDialog={handleOpenEditSheetAliasDialog}
        onOpenEditWorkbookAliasDialog={handleOpenEditWorkbookAliasDialog}
        onOpenRenameSheetDialog={handleOpenRenameSheetDialog}
        onRenameSheetNameChange={setRenameSheetName}
        onResetFreezeDialog={() => {
          setFreezeDialogRowCount(0);
          setFreezeDialogColumnCount(0);
        }}
        onSaveWorkspaceCodegenConfig={handleSaveWorkspaceCodegenConfig}
        renameSheetInputRef={renameSheetInputRef}
        renameSheetName={renameSheetName}
        renameSheetTarget={renameSheetTarget}
        sheetContextMenu={sheetContextMenu}
        sheetContextMenuRef={sheetContextMenuRef}
        sheetDialogWorkbookName={sheetDialogWorkbookName}
        visibleColumnCount={activeSheetColumns.length}
        visibleRowCount={filteredRowEntries.length}
        workbookContextMenu={workbookContextMenu}
        workbookContextMenuRef={workbookContextMenuRef}
        workspacePath={workspacePath ?? ""}
        />
      ) : null}

      <McpConfigDialog
        errorMessage={mcpConfigErrorMessage}
        hasValidPort={hasValidMcpConfigPort}
        isEnabled={mcpPreferences?.enabled ?? false}
        isOpen={isMcpConfigDialogOpen}
        isSaving={isSavingMcpConfiguration}
        isStarting={isStartingMcpFromDialog}
        lastStartError={mcpPreferences?.lastStartError ?? null}
        onAutoFindPort={handleAutoFindAvailableMcpPort}
        onClose={handleCloseMcpConfigDialog}
        onCopyJson={handleCopyMcpConfigJson}
        onPathInputChange={setMcpConfigPathInput}
        onPortInputChange={setMcpConfigPortInput}
        onSave={handleSaveMcpConfiguration}
        onSelectTargetClient={handleSelectMcpConfigTargetClient}
        onStart={handleStartMcpFromConfigurationDialog}
        pathInput={mcpConfigPathInput}
        portInput={mcpConfigPortInput}
        previewJson={mcpConfigPreviewJson}
        previewUrl={mcpConfigPreviewUrl}
        serverHost={mcpPreferences?.serverHost ?? "127.0.0.1"}
        statusLabel={mcpStatusLabel}
        targetClient={mcpConfigTargetClient}
        textareaRef={mcpConfigTextareaRef}
      />

      <ToastCenter
        onCloseSelectedToast={() => setSelectedErrorToastId(null)}
        onCopySelectedDetail={() => void handleCopySelectedDetail()}
        onDismissToast={dismissToast}
        onHoverToast={setHoveredToastId}
        onOpenToastDetail={openToastDetail}
        onRunToastAction={handleRunToastAction}
        selectedToast={selectedErrorToast}
        toasts={toastNotifications}
      />

      <header className="app-toolbar">
        <div className="toolbar-menu-bar toolbar-no-drag">
          <div className="app-toolbar-menu-group">
            <button
              aria-expanded={openToolbarMenu === "file"}
              className={`toolbar-menu-trigger${openToolbarMenu === "file" ? " is-open" : ""}`}
              onMouseEnter={() => handleToolbarMenuHover("file")}
              onClick={() => toggleToolbarMenu("file")}
              type="button"
            >
              文件
            </button>
            {openToolbarMenu === "file" ? (
              <div className="toolbar-menu-dropdown" role="menu">
                {renderToolbarMenuSection("工作区", <>
                  {renderToolbarMenuItem({
                    label: "已打开工作区",
                    checked: canCloseWorkspace,
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: "新建工作区",
                    onClick: () => {
                      closeToolbarMenu();
                      void handleOpenCreateWorkspaceDialog();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "选择工作区目录",
                    shortcut: "Ctrl+O",
                    disabled: !canChooseWorkspaceDirectory,
                    onClick: () => {
                      closeToolbarMenu();
                      void chooseWorkspaceDirectory();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "关闭工作区",
                    shortcut: "Ctrl+Shift+W",
                    disabled: !canCloseWorkspace,
                    onClick: () => {
                      closeToolbarMenu();
                      handleCloseWorkspace();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "按模板更新内置流程图节点",
                    disabled: !canCloseWorkspace,
                    onClick: () => {
                      closeToolbarMenu();
                      void handleRefreshBuiltinFlowChartNodes();
                    },
                  })}
                </>)}
                <div className="toolbar-menu-separator" />
                {renderToolbarMenuSection("内容", <>
                  {renderToolbarMenuItem({
                    label: "新建工作簿",
                    shortcut: "Ctrl+N",
                    disabled: workspaceStatus !== "ready",
                    onClick: () => {
                      closeToolbarMenu();
                      handleOpenCreateWorkbookDialog();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "新建表格",
                    disabled: !canCreateSheet,
                    onClick: () => {
                      closeToolbarMenu();
                      if (focusedWorkbookName) {
                        handleOpenCreateSheetDialog(focusedWorkbookName);
                      }
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "校验当前工作簿",
                    disabled: !focusedWorkbookName,
                    onClick: () => {
                      closeToolbarMenu();
                      if (focusedWorkbookName) {
                        void validateWorkbookCode(focusedWorkbookName);
                      }
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "导出当前工作簿代码",
                    disabled: !focusedWorkbookName,
                    onClick: () => {
                      closeToolbarMenu();
                      if (focusedWorkbookName) {
                        handleConvertWorkbookCode(focusedWorkbookName);
                      }
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "导出所有工作簿代码",
                    disabled: workspaceStatus !== "ready" || (workspace?.workbooks.length ?? 0) === 0,
                    onClick: () => {
                      void handleExportAllWorkbookCode();
                    },
                  })}
                </>)}
              </div>
            ) : null}
          </div>

          <div className="app-toolbar-menu-group">
            <button
              aria-expanded={openToolbarMenu === "edit"}
              className={`toolbar-menu-trigger${openToolbarMenu === "edit" ? " is-open" : ""}`}
              disabled={!isWorkbookMode}
              onMouseEnter={() => {
                if (isWorkbookMode) {
                  handleToolbarMenuHover("edit");
                }
              }}
              onClick={() => {
                if (isWorkbookMode) {
                  toggleToolbarMenu("edit");
                }
              }}
              type="button"
            >
              编辑
            </button>
            {isWorkbookMode && openToolbarMenu === "edit" ? (
              <div className="toolbar-menu-dropdown" role="menu">
                {renderToolbarMenuSection("历史记录", <>
                  {renderToolbarMenuItem({
                    label: "表格有未保存修改",
                    checked: Boolean(activeSheetState?.dirty),
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: "撤销",
                    shortcut: "Ctrl+Z",
                    disabled: !canUndoActiveSheet,
                    onClick: () => {
                      closeToolbarMenu();
                      undoActiveSheetEdit();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "恢复",
                    shortcut: "Ctrl+Y",
                    disabled: !canRedoActiveSheet,
                    onClick: () => {
                      closeToolbarMenu();
                      redoActiveSheetEdit();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "还原当前表格",
                    disabled: !activeSheetState?.dirty,
                    onClick: () => {
                      closeToolbarMenu();
                      restoreActiveSheetDraft();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "保存当前工作簿",
                    shortcut: "Ctrl+S",
                    disabled: !canSaveActiveWorkbook,
                    onClick: () => {
                      closeToolbarMenu();
                      void saveActiveWorkbook();
                    },
                  })}
                </>)}
                <div className="toolbar-menu-separator" />
                {renderToolbarMenuSection("剪贴板", <>
                  {renderToolbarMenuItem({
                    label: "复制选区",
                    shortcut: "Ctrl+C",
                    disabled: !selectedCell,
                    onClick: () => {
                      closeToolbarMenu();
                      void handleCopySelectionToClipboard();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "剪切选区",
                    shortcut: "Ctrl+X",
                    disabled: !selectedCell,
                    onClick: () => {
                      closeToolbarMenu();
                      void handleCutSelection();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "清空选区",
                    shortcut: "Delete",
                    disabled: !selectedCell,
                    onClick: () => {
                      closeToolbarMenu();
                      handleClearSelectionContents();
                    },
                  })}
                </>)}
              </div>
            ) : null}
          </div>

          <div className="app-toolbar-menu-group">
            <button
              aria-expanded={openToolbarMenu === "table"}
              className={`toolbar-menu-trigger${openToolbarMenu === "table" ? " is-open" : ""}`}
              disabled={!isWorkbookMode}
              onMouseEnter={() => {
                if (isWorkbookMode) {
                  handleToolbarMenuHover("table");
                }
              }}
              onClick={() => {
                if (isWorkbookMode) {
                  toggleToolbarMenu("table");
                }
              }}
              type="button"
            >
              表格
            </button>
            {isWorkbookMode && openToolbarMenu === "table" ? (
              <div className="toolbar-menu-dropdown" role="menu">
                {renderToolbarMenuSection("表格状态", <>
                  {renderToolbarMenuItem({
                    label: "已启用冻结",
                    checked: appliedFreezeRowCount > 0 || appliedFreezeColumnCount > 0,
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: "当前工作簿已聚焦",
                    checked: Boolean(focusedWorkbookName),
                    disabled: true,
                    onClick: () => {},
                  })}
                </>)}
                <div className="toolbar-menu-separator" />
                {renderToolbarMenuSection("结构", <>
                  {renderToolbarMenuItem({
                    label: "新建表格",
                    disabled: !canCreateSheet,
                    onClick: () => {
                      closeToolbarMenu();
                      if (focusedWorkbookName) {
                        handleOpenCreateSheetDialog(focusedWorkbookName);
                      }
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "在末尾添加行",
                    disabled: !activeSheetData,
                    onClick: () => {
                      closeToolbarMenu();
                      handleAppendRow();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "在末尾添加列",
                    disabled: !activeSheetData,
                    onClick: () => {
                      closeToolbarMenu();
                      handleAppendColumn();
                    },
                  })}
                </>)}
                <div className="toolbar-menu-separator" />
                {renderToolbarMenuSection("视图", <>
                  {renderToolbarMenuItem({
                    label: "设置冻结",
                    disabled: !activeSheetData,
                    onClick: () => {
                      closeToolbarMenu();
                      handleOpenFreezeDialog();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "取消冻结",
                    disabled: appliedFreezeRowCount === 0 && appliedFreezeColumnCount === 0,
                    onClick: () => {
                      closeToolbarMenu();
                      setFreezeRowCount(0);
                      setFreezeColumnCount(0);
                    },
                  })}
                </>)}
              </div>
            ) : null}
          </div>

          <div className="app-toolbar-menu-group">
            <button
              aria-expanded={openToolbarMenu === "ai"}
              className={`toolbar-menu-trigger${openToolbarMenu === "ai" ? " is-open" : ""}`}
              onMouseEnter={() => handleToolbarMenuHover("ai")}
              onClick={() => toggleToolbarMenu("ai")}
              type="button"
            >
              AI工具
            </button>
            {openToolbarMenu === "ai" ? (
              <div className="toolbar-menu-dropdown toolbar-menu-dropdown-wide" role="menu">
                {renderToolbarMenuSection("MCP 服务", <>
                  {renderToolbarMenuItem({
                    label: `当前状态 ${mcpStatusLabel}`,
                    checked: mcpPreferences?.runtimeStatus === "running",
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: mcpPreferences?.enabled ? "关闭 MCP 服务" : "开启 MCP 服务",
                    onClick: () => {
                      closeToolbarMenu();
                      void handleToggleMcpEnabled();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "配置 MCP 服务",
                    onClick: () => {
                      closeToolbarMenu();
                      handleOpenMcpConfigDialog();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "复制配置 JSON",
                    onClick: () => {
                      closeToolbarMenu();
                      handleOpenMcpConfigDialog({ targetClient: "vscode" });
                    },
                  })}
                </>)}
                <div className="toolbar-menu-separator" />
                {renderToolbarMenuSection("编辑器上下文", <>
                  {renderToolbarMenuItem({
                    label: currentSheetContext
                      ? `当前 Sheet ${currentSheetContext.workbookName} / ${currentSheetContext.sheetName}`
                      : "当前没有活动 Sheet",
                    checked: Boolean(currentSheetContext),
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: "复制当前 Sheet 上下文 JSON",
                    disabled: !currentSheetContext,
                    onClick: () => {
                      closeToolbarMenu();
                      void handleCopyCurrentSheetContextJson();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "复制当前选区上下文 JSON",
                    disabled: !currentSelectionContext,
                    onClick: () => {
                      closeToolbarMenu();
                      void handleCopyCurrentSelectionContextJson();
                    },
                  })}
                </>)}
              </div>
            ) : null}
          </div>

          <div className="app-toolbar-menu-group">
            <button
              aria-expanded={openToolbarMenu === "help"}
              className={`toolbar-menu-trigger${openToolbarMenu === "help" ? " is-open" : ""}`}
              onMouseEnter={() => handleToolbarMenuHover("help")}
              onClick={() => toggleToolbarMenu("help")}
              type="button"
            >
              帮助
            </button>
            {openToolbarMenu === "help" ? (
              <div className="toolbar-menu-dropdown" role="menu">
                {renderToolbarMenuSection("更新", <>
                  {renderToolbarMenuItem({
                    label: `当前版本 ${updateInfo?.currentVersion ?? "待检查"}`,
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: `更新状态 ${updateStatusText}`,
                    disabled: true,
                    onClick: () => {},
                  })}
                  {renderToolbarMenuItem({
                    label: "检查更新",
                    onClick: () => {
                      closeToolbarMenu();
                      void handleCheckForUpdates();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: installButtonLabel,
                    disabled: !canInstallUpdate || updateDownloadState?.status === "launching",
                    onClick: () => {
                      closeToolbarMenu();
                      void handleInstallUpdate();
                    },
                  })}
                  {renderToolbarMenuItem({
                    label: "打开发布页",
                    disabled: !(updateResult?.downloadUrl ?? updateResult?.releasesPageUrl ?? updateInfo?.releasesPageUrl),
                    onClick: () => {
                      closeToolbarMenu();
                      void handleOpenUpdateRelease();
                    },
                  })}
                </>)}
              </div>
            ) : null}
          </div>
        </div>

        <div aria-label="编辑模式" className="toolbar-mode-switch toolbar-no-drag" role="tablist">
          <button
            aria-selected={isWorkbookMode}
            className={`toolbar-mode-button${isWorkbookMode ? " is-active" : ""}`}
            onClick={() => setEditorMode("workbook")}
            role="tab"
            type="button"
          >
            工作簿
          </button>
          <button
            aria-selected={isFlowChartMode}
            className={`toolbar-mode-button${isFlowChartMode ? " is-active" : ""}`}
            onClick={() => setEditorMode("flowchart")}
            role="tab"
            type="button"
          >
            流程图
          </button>
        </div>

        <div aria-hidden="true" className="app-toolbar-drag-region" />

        <div aria-hidden="true" className="app-toolbar-title toolbar-no-drag">Lighty Design</div>

        {canUseNativeWindowControls ? (
          <div aria-label="窗口控制" className="window-controls toolbar-no-drag">
            <button
              aria-label="最小化窗口"
              className="window-control-button"
              onClick={() => void handleMinimizeWindow()}
              title="最小化"
              type="button"
            >
              -
            </button>
            <button
              aria-label="最大化或还原窗口"
              className="window-control-button"
              onClick={() => void handleToggleMaximizeWindow()}
              title="最大化或还原"
              type="button"
            >
              []
            </button>
            <button
              aria-label="关闭窗口"
              className="window-control-button is-close"
              onClick={() => void handleCloseWindow()}
              title="关闭"
              type="button"
            >
              x
            </button>
          </div>
        ) : null}
      </header>

      {isWorkbookMode ? (
        <WorkbookEditorView
          activeSheetColumns={activeSheetColumns}
          activeSheetData={activeSheetData ?? null}
          activeSheetRows={activeSheetRows}
          activeSheetState={activeSheetState}
          activeTab={activeTab}
          activeTabId={activeTabId}
          activeWorkbookDirtyTabCount={activeWorkbookDirtyTabs.length}
          appliedFreezeColumnCount={appliedFreezeColumnCount}
          appliedFreezeRowCount={appliedFreezeRowCount}
          canCreateSheet={canCreateSheet}
          canEditActiveSheet={canEditActiveSheet}
          canInsertCopiedCellsDown={Boolean(copiedSelectionSnapshot)}
          canInsertCopiedColumns={Boolean(copiedSelectionSnapshot?.canInsertColumns)}
          canInsertCopiedRows={Boolean(copiedSelectionSnapshot?.canInsertRows)}
          canRedoActiveSheet={canRedoActiveSheet}
          canSaveActiveWorkbook={canSaveActiveWorkbook}
          canUndoActiveSheet={canUndoActiveSheet}
          columnWidths={activeColumnWidths}
          editingColumn={editingColumn}
          editingColumnIndex={editingColumnIndex}
          filteredRowEntries={filteredRowEntries}
          focusedWorkbook={focusedWorkbook}
          focusedWorkbookName={focusedWorkbookName}
          freezeStatusText={freezeStatusText}
          onAppendColumn={handleAppendColumn}
          onAppendRow={handleAppendRow}
          onAutoFillSelection={handleAutoFillSelection}
          onAutoSizeColumn={handleAutoSizeColumn}
          onClearSelection={handleClearSelectionContents}
          onCloseColumnEditor={handleCloseColumnEditor}
          onCopySelection={handleCopySelection}
          onCopySelectionToClipboard={() => {
            void handleCopySelectionToClipboard();
          }}
          onCreateSheet={handleOpenCreateSheetDialog}
          onCreateWorkbook={handleOpenCreateWorkbookDialog}
          onCutSelection={() => {
            void handleCutSelection();
          }}
          onDeleteColumn={handleDeleteColumn}
          onDeleteRow={handleDeleteRow}
          onEditCell={updateCellValue}
          onFocusWorkbook={handleFocusWorkbook}
          onFormulaBarChange={handleFormulaBarChange}
          onFreezeColumns={setFreezeColumnCount}
          onFreezeRows={setFreezeRowCount}
          onInsertColumn={handleInsertColumn}
          onInsertColumnBefore={handleInsertColumnBefore}
          onInsertCopiedCellsDown={handleInsertCopiedCellsDown}
          onInsertCopiedColumnsAfter={(columnIndex) => handleInsertCopiedColumns(columnIndex + 1)}
          onInsertCopiedColumnsBefore={handleInsertCopiedColumns}
          onInsertCopiedRowsAbove={handleInsertCopiedRows}
          onInsertCopiedRowsBelow={(rowIndex) => handleInsertCopiedRows(rowIndex + 1)}
          onInsertRow={handleInsertRow}
          onInsertRowAbove={handleInsertRowAbove}
          onOpenColumnEditor={handleOpenColumnEditor}
          onOpenFreezeDialog={handleOpenFreezeDialog}
          onOpenSheet={openSheet}
          onOpenSheetContextMenu={handleOpenSheetContextMenu}
          onOpenWorkbookContextMenu={handleOpenWorkbookContextMenu}
          onPasteIntoCurrentSelectionFromClipboard={handlePasteCurrentSelectionFromClipboard}
          onPasteSelection={handlePasteSelection}
          onPasteSelectionFromClipboard={handlePasteSelectionFromClipboard}
          onRedoActiveSheetEdit={redoActiveSheetEdit}
          onResizeColumn={handleResizeColumn}
          onResolveValidationSchema={handleResolveValidationSchema}
          onRetryActiveSheetLoad={retryActiveSheetLoad}
          onRetryWorkspaceLoad={retryWorkspaceLoad}
          onSaveActiveWorkbook={() => {
            void saveActiveWorkbook();
          }}
          onSaveColumnDefinition={handleSaveColumnDefinition}
          onSelectAll={handleSelectAll}
          onSelectCell={handleSelectCell}
          onSelectColumn={handleSelectColumn}
          onSelectRow={handleSelectRow}
          onSheetFilterChange={setSheetFilter}
          onSheetScrollSnapshotChange={(snapshot) => {
            if (!activeTabId) {
              return;
            }

            sheetScrollSnapshotsRef.current[activeTabId] = snapshot;
          }}
          onUndoActiveSheetEdit={undoActiveSheetEdit}
          onValidateColumnType={handleValidateColumnType}
          onValidateColumnValidationRule={handleValidateColumnValidationRule}
          propertySchemas={headerPropertySchemas}
          restoreScrollRequest={
            scrollRestoreRequest && activeTabId === scrollRestoreRequest.tabId
              ? scrollRestoreRequest
              : null
          }
          saveStatusText={saveStatusText}
          selectedCell={selectedCell}
          selectedCellAddress={selectedCellAddress}
          selectedCellCount={selectedCellCount}
          selectedCellDescription={selectedCellDescription}
          selectedCellValue={selectedCellValue}
          selectionRange={selectionRange}
          selectionStatusText={selectionStatusText}
          sheetFilter={sheetFilter}
          typeMetadata={typeMetadata}
          workbookTree={workbookTree}
          workspaceError={workspaceError}
          workspaceSearch={workspaceSearch}
          workspaceStatus={workspaceStatus}
          onWorkspaceSearchChange={setWorkspaceSearch}
        />
      ) : (
        <FlowChartEditorView editor={flowChartEditor} workspacePath={workspacePath} />
      )}

      <footer className="status-bar">
        <div className="status-segment">
          <span className="status-label">后端</span>
          <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">{isWorkbookMode ? "选区" : "对象"}</span>
          <strong>{isWorkbookMode ? selectionStatusText : flowChartSelectionText}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">{isWorkbookMode ? "冻结" : "结构"}</span>
          <strong>{isWorkbookMode ? freezeStatusText : flowChartStructureText}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">更改</span>
          <strong>{isWorkbookMode ? (hasDirtyChanges ? "存在未保存更改" : "无未保存更改") : flowChartDirtyText}</strong>
        </div>
      </footer>
    </div>
  );
}

export default App;