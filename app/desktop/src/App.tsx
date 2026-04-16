import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ColumnEditorDialog } from "./components/ColumnEditorDialog";
import { DialogBackdrop } from "./components/DialogBackdrop";
import { EditorWorkspaceHeader } from "./components/EditorWorkspaceHeader";
import { ToastCenter } from "./components/ToastCenter";
import { VirtualSheetTable } from "./components/VirtualSheetTable";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useDesktopHostConnection } from "./hooks/useDesktopHostConnection";
import { isShortcutModifierPressed, useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useToastCenter } from "./hooks/useToastCenter";
import { useWorkspaceEditor } from "./hooks/useWorkspaceEditor";
import { buildWorkspaceScopedStorageKey, cloneColumns, getSelectionBounds, type SheetColumn, type SheetSelection, type SheetSelectionRange, type ShortcutBinding } from "./types/desktopApp";
import { buildAutoFillSeriesGenerator } from "./utils/autoFill";

type CopiedSelectionSnapshot = {
  matrix: string[][];
  copiedColumns: SheetColumn[];
  canInsertRows: boolean;
  canInsertColumns: boolean;
};

type SheetScrollSnapshot = {
  scrollLeft: number;
  scrollTop: number;
};

type ToolbarMenuId = "file" | "edit" | "table" | "ai" | "help";
type CodegenDialogMode = "single" | "all";
type McpConfigTargetClient = "vscode";

function normalizeMcpConfigPath(pathValue: string) {
  const trimmedValue = pathValue.trim();
  if (!trimmedValue) {
    return "/mcp";
  }

  return trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
}

function buildVsCodeMcpConfigJson(serverUrl: string) {
  return JSON.stringify(
    {
      servers: {
        lightydesign: {
          type: "http",
          url: serverUrl,
        },
      },
    },
    null,
    2,
  );
}

function getMcpRuntimeStatusLabel(mcpPreferences: McpPreferences | null) {
  if (!mcpPreferences) {
    return "状态未知";
  }

  if (!mcpPreferences.enabled) {
    return "已关闭";
  }

  switch (mcpPreferences.runtimeStatus) {
    case "running":
      return "运行中";
    case "starting":
      return "启动中";
    case "error":
      return "启动失败";
    default:
      return "已关闭";
  }
}

const defaultColumnWidth = 140;
const minColumnWidth = 88;
const maxColumnWidth = 520;
const columnWidthSampleLimit = 200;
const contextMenuViewportMargin = 8;
const selectionContextRowPreviewLimit = 50;
const selectionContextColumnPreviewLimit = 20;

let textMeasureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string, font = '12px "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif') {
  if (typeof document === "undefined") {
    return text.length * 8;
  }

  if (!textMeasureCanvas) {
    textMeasureCanvas = document.createElement("canvas");
  }

  const context = textMeasureCanvas.getContext("2d");
  if (!context) {
    return text.length * 8;
  }

  context.font = font;
  return context.measureText(text).width;
}

function getExcelColumnName(columnIndex: number) {
  let current = columnIndex + 1;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

function formatSelectionAddress(range: SheetSelectionRange) {
  const bounds = getSelectionBounds(range);
  const startAddress = `${getExcelColumnName(bounds.startColumnIndex)}${bounds.startRowIndex + 1}`;
  const endAddress = `${getExcelColumnName(bounds.endColumnIndex)}${bounds.endRowIndex + 1}`;

  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
}

function parseClipboardMatrix(clipboardText: string) {
  const normalizedText = clipboardText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = normalizedText.split("\n");

  if (rows.at(-1) === "") {
    rows.pop();
  }

  return rows.map((row) => row.split("\t"));
}

function getPositiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function buildRepeatedFillValue(sourceMatrix: string[][], sourceStartVisibleIndex: number, visibleRowIndex: number, startColumnIndex: number, columnIndex: number) {
  const sourceRowCount = sourceMatrix.length;
  const sourceColumnCount = sourceMatrix[0]?.length ?? 0;
  if (sourceRowCount <= 0 || sourceColumnCount <= 0) {
    return "";
  }

  const sourceRowOffset = getPositiveModulo(visibleRowIndex - sourceStartVisibleIndex, sourceRowCount);
  const sourceColumnOffset = getPositiveModulo(columnIndex - startColumnIndex, sourceColumnCount);
  return sourceMatrix[sourceRowOffset]?.[sourceColumnOffset] ?? "";
}

function normalizeDirectoryPath(path: string) {
  return path.replace(/[\\/]+/g, "\\").replace(/[\\/]+$/, "");
}

function tryGetWorkspaceRelativePath(workspaceRoot: string, absolutePath: string) {
  const normalizedWorkspaceRoot = normalizeDirectoryPath(workspaceRoot);
  const normalizedAbsolutePath = normalizeDirectoryPath(absolutePath);
  const workspaceRootSegments = normalizedWorkspaceRoot.split("\\").filter((segment) => segment.length > 0);
  const absolutePathSegments = normalizedAbsolutePath.split("\\").filter((segment) => segment.length > 0);

  if (workspaceRootSegments.length === 0 || absolutePathSegments.length === 0) {
    return null;
  }

  if (workspaceRootSegments[0]?.toLowerCase() !== absolutePathSegments[0]?.toLowerCase()) {
    return null;
  }

  if (normalizedAbsolutePath.toLowerCase() === normalizedWorkspaceRoot.toLowerCase()) {
    return "";
  }

  let sharedLength = 0;
  const maxSharedLength = Math.min(workspaceRootSegments.length, absolutePathSegments.length);

  while (
    sharedLength < maxSharedLength &&
    workspaceRootSegments[sharedLength]?.toLowerCase() === absolutePathSegments[sharedLength]?.toLowerCase()
  ) {
    sharedLength += 1;
  }

  const upwardSegments = Array.from({ length: workspaceRootSegments.length - sharedLength }, () => "..");
  const downwardSegments = absolutePathSegments.slice(sharedLength);
  return [...upwardSegments, ...downwardSegments].join("/");
}

function formatByteSize(byteCount: number | null | undefined) {
  if (!byteCount || byteCount <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = byteCount;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function clampContextMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  containerRect?: DOMRect | null,
) {
  const boundsLeft = containerRect?.left ?? 0;
  const boundsTop = containerRect?.top ?? 0;
  const boundsRight = containerRect?.right ?? window.innerWidth;
  const boundsBottom = containerRect?.bottom ?? window.innerHeight;
  const minLeft = boundsLeft + contextMenuViewportMargin;
  const minTop = boundsTop + contextMenuViewportMargin;
  const maxLeft = Math.max(minLeft, boundsRight - menuWidth - contextMenuViewportMargin);
  const maxTop = Math.max(minTop, boundsBottom - menuHeight - contextMenuViewportMargin);

  return {
    x: Math.min(Math.max(x, minLeft), maxLeft),
    y: Math.min(Math.max(y, minTop), maxTop),
  };
}

function App() {
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const workbookContextMenuRef = useRef<HTMLDivElement | null>(null);
  const sheetContextMenuRef = useRef<HTMLDivElement | null>(null);
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
    externalRefreshVersion,
    setSheetFilter,
    workbookTree,
    activeTab,
    activeSheetState,
    activeSheetData,
    activeSheetColumns,
    activeSheetRows,
    activeWorkbookSaveState,
    activeWorkbookDirtyTabs,
    filteredRowEntries,
    hasDirtyChanges,
    openSheet,
    closeAllTabs,
    chooseParentDirectoryForWorkspaceCreation,
    createWorkspace,
    createWorkbook,
    deleteWorkbook,
    createSheet,
    deleteSheet,
    renameSheet,
    saveWorkspaceCodegenOptions,
    exportWorkbookCode,
    exportAllWorkbookCode,
    chooseWorkspaceDirectory,
    closeWorkspace,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    applyCellEdits,
    insertRow,
    deleteRow,
    deleteRows,
    insertColumn,
    deleteColumn,
    deleteColumns,
    insertCopiedRows,
    insertCopiedColumns,
    insertCopiedCellsDown,
    updateColumnDefinition,
    updateCellValue,
    activateWorkbook,
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
    setWorkbookAlias,
    setSheetAlias,
  } = useWorkspaceEditor({
    hostInfo,
    onToast: pushToastNotification,
  });

  const hostStatusLabel = bridgeStatus === "unavailable" ? "桥接不可用" : hostHealth?.ok ? "已连接" : "连接中";
  const hostStatusClassName = bridgeStatus === "unavailable" ? "status-chip is-error" : hostHealth?.ok ? "status-chip is-ok" : "status-chip is-warn";
  const canUndoActiveSheet = Boolean(activeSheetState?.undoStack?.length);
  const canRedoActiveSheet = Boolean(activeSheetState?.redoStack?.length);
  const canSaveActiveWorkbook = Boolean(
    activeTab && hostInfo && workspacePath && activeWorkbookDirtyTabs.length > 0 && activeWorkbookSaveState?.status !== "saving",
  );
  const canChooseWorkspaceDirectory = bridgeStatus === "ready";
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
  const [isCreateWorkbookDialogOpen, setIsCreateWorkbookDialogOpen] = useState(false);
  const [isEditWorkbookAliasDialogOpen, setIsEditWorkbookAliasDialogOpen] = useState(false);
  const [editWorkbookAliasTarget, setEditWorkbookAliasTarget] = useState<string | null>(null);
  const [editWorkbookAliasValue, setEditWorkbookAliasValue] = useState("");
  const [isCreateSheetDialogOpen, setIsCreateSheetDialogOpen] = useState(false);
  const [isRenameSheetDialogOpen, setIsRenameSheetDialogOpen] = useState(false);
  const [isEditSheetAliasDialogOpen, setIsEditSheetAliasDialogOpen] = useState(false);
  const [editSheetAliasTarget, setEditSheetAliasTarget] = useState<{ workbookName: string; sheetName: string } | null>(null);
  const [editSheetAliasValue, setEditSheetAliasValue] = useState("");
  const [isDotnetMissingModalOpen, setIsDotnetMissingModalOpen] = useState(false);
  const [isCodegenDialogOpen, setIsCodegenDialogOpen] = useState(false);
  const [isFreezeDialogOpen, setIsFreezeDialogOpen] = useState(false);
  const [isMcpConfigDialogOpen, setIsMcpConfigDialogOpen] = useState(false);
  const [newWorkbookName, setNewWorkbookName] = useState("NewWorkbook");
  const [newSheetName, setNewSheetName] = useState("NewSheet");
  const [renameSheetName, setRenameSheetName] = useState("");
  const [codegenOutputRelativePath, setCodegenOutputRelativePath] = useState("");
  const [mcpConfigTargetClient, setMcpConfigTargetClient] = useState<McpConfigTargetClient | null>(null);
  const [mcpConfigPortInput, setMcpConfigPortInput] = useState("");
  const [mcpConfigPathInput, setMcpConfigPathInput] = useState("/mcp");
  const [mcpConfigErrorMessage, setMcpConfigErrorMessage] = useState<string | null>(null);
  const [isSavingMcpConfiguration, setIsSavingMcpConfiguration] = useState(false);
  const [isStartingMcpFromDialog, setIsStartingMcpFromDialog] = useState(false);
  const [sheetDialogWorkbookName, setSheetDialogWorkbookName] = useState<string | null>(null);
  const [renameSheetTarget, setRenameSheetTarget] = useState<{ workbookName: string; sheetName: string } | null>(null);
  const [codegenWorkbookName, setCodegenWorkbookName] = useState<string | null>(null);
  const [codegenDialogMode, setCodegenDialogMode] = useState<CodegenDialogMode>("single");
  const renameSheetInputRef = useRef<HTMLInputElement | null>(null);
  const codegenOutputInputRef = useRef<HTMLInputElement | null>(null);
  const mcpConfigTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<SheetSelection | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<SheetSelection | null>(null);
  const [freezeRowCount, setFreezeRowCount] = useState(0);
  const [freezeColumnCount, setFreezeColumnCount] = useState(0);
  const [columnWidthsBySheet, setColumnWidthsBySheet] = useState<Record<string, number[]>>({});
  const [freezeDialogRowCount, setFreezeDialogRowCount] = useState(0);
  const [freezeDialogColumnCount, setFreezeDialogColumnCount] = useState(0);
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<ToolbarMenuId | null>(null);
  const [focusedWorkbookName, setFocusedWorkbookName] = useState<string | null>(null);
  const [workbookContextMenu, setWorkbookContextMenu] = useState<{
    workbookName: string;
    x: number;
    y: number;
  } | null>(null);
  const [sheetContextMenu, setSheetContextMenu] = useState<{
    workbookName: string;
    sheetName: string;
    x: number;
    y: number;
  } | null>(null);
  const [copiedSelectionSnapshot, setCopiedSelectionSnapshot] = useState<CopiedSelectionSnapshot | null>(null);
  const [mcpPreferences, setMcpPreferences] = useState<McpPreferences | null>(null);
  const sheetScrollSnapshotsRef = useRef<Record<string, SheetScrollSnapshot>>({});
  const [scrollRestoreRequest, setScrollRestoreRequest] = useState<{
    tabId: string;
    key: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    if (!hostHealth) {
      return;
    }

    const message = (hostHealth.message ?? "").toLowerCase();
    if (!hostHealth.ok && (message.includes("dotnet") || message.includes(".net") || message.includes("运行库") || message.includes("runtime"))) {
      setIsDotnetMissingModalOpen(true);
    }
  }, [hostHealth]);

  const editingColumn = editingColumnIndex !== null ? (activeSheetColumns[editingColumnIndex] ?? null) : null;
  const focusedWorkbook = useMemo(
    () => workbookTree.find((workbook) => workbook.name === focusedWorkbookName) ?? null,
    [focusedWorkbookName, workbookTree],
  );
  const canCreateSheet = workspaceStatus === "ready" && Boolean(focusedWorkbookName);
  const canCloseWorkspace = Boolean(workspacePath);
  const workspaceCodegenOutputRelativePath = workspace?.codegen.outputRelativePath ?? "";
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
    const written = await writeClipboardText(mcpConfigPreviewJson);
    if (!written) {
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

  function getContextMenuContainerRect() {
    return appShellRef.current?.getBoundingClientRect() ?? null;
  }

  useLayoutEffect(() => {
    if (!workbookContextMenu || !workbookContextMenuRef.current) {
      return;
    }

    const nextPosition = clampContextMenuPosition(
      workbookContextMenu.x,
      workbookContextMenu.y,
      workbookContextMenuRef.current.offsetWidth,
      workbookContextMenuRef.current.offsetHeight,
      getContextMenuContainerRect(),
    );

    if (nextPosition.x !== workbookContextMenu.x || nextPosition.y !== workbookContextMenu.y) {
      setWorkbookContextMenu((current) => {
        if (!current) {
          return null;
        }

        return nextPosition.x === current.x && nextPosition.y === current.y
          ? current
          : { ...current, x: nextPosition.x, y: nextPosition.y };
      });
    }
  }, [workbookContextMenu]);

  useLayoutEffect(() => {
    if (!sheetContextMenu || !sheetContextMenuRef.current) {
      return;
    }

    const nextPosition = clampContextMenuPosition(
      sheetContextMenu.x,
      sheetContextMenu.y,
      sheetContextMenuRef.current.offsetWidth,
      sheetContextMenuRef.current.offsetHeight,
      getContextMenuContainerRect(),
    );

    if (nextPosition.x !== sheetContextMenu.x || nextPosition.y !== sheetContextMenu.y) {
      setSheetContextMenu((current) => {
        if (!current) {
          return null;
        }

        return nextPosition.x === current.x && nextPosition.y === current.y
          ? current
          : { ...current, x: nextPosition.x, y: nextPosition.y };
      });
    }
  }, [sheetContextMenu]);

  function handleFocusWorkbook(workbookName: string) {
    if (focusedWorkbookName && focusedWorkbookName !== workbookName) {
      const closed = closeAllTabs();
      if (!closed) {
        return;
      }
    }

    setFocusedWorkbookName(workbookName);
    setWorkbookContextMenu(null);
    setSheetContextMenu(null);
  }

  function handleCloseWorkspace() {
    const closed = closeWorkspace();
    if (closed) {
      setFocusedWorkbookName(null);
      setWorkbookContextMenu(null);
      setSheetContextMenu(null);
    }
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

  function applySelectionRange(anchor: SheetSelection, focus: SheetSelection) {
    setSelectionAnchor(anchor);
    setSelectedCell(focus);
  }

  function handleSelectAll() {
    if (!activeSheetData || filteredRowEntries.length === 0) {
      return;
    }

    applySelectionRange(
      { rowIndex: filteredRowEntries[0].rowIndex, columnIndex: 0 },
      {
        rowIndex: filteredRowEntries[filteredRowEntries.length - 1].rowIndex,
        columnIndex: activeSheetColumns.length - 1,
      },
    );
  }

  async function writeClipboardText(text: string) {
    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      pushToastNotification({
        title: "剪贴板写入失败",
        detail: error instanceof Error ? error.message : "无法将当前选区写入剪贴板。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function readClipboardText() {
    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      pushToastNotification({
        title: "剪贴板读取失败",
        detail: error instanceof Error ? error.message : "无法从系统剪贴板读取文本。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return null;
    }
  }

  function handleSelectRow(rowIndex: number, options?: { extendSelection?: boolean }) {
    if (!activeSheetData || activeSheetColumns.length === 0) {
      return;
    }

    const anchorRowIndex = options?.extendSelection
      ? (selectionAnchor?.rowIndex ?? selectedCell?.rowIndex ?? rowIndex)
      : rowIndex;

    applySelectionRange(
      { rowIndex: anchorRowIndex, columnIndex: 0 },
      { rowIndex, columnIndex: activeSheetColumns.length - 1 },
    );
  }

  function handleSelectColumn(columnIndex: number, options?: { extendSelection?: boolean }) {
    if (filteredRowEntries.length === 0) {
      return;
    }

    const startRowIndex = filteredRowEntries[0].rowIndex;
    const endRowIndex = filteredRowEntries[filteredRowEntries.length - 1].rowIndex;
    const anchorColumnIndex = options?.extendSelection
      ? (selectionAnchor?.columnIndex ?? selectedCell?.columnIndex ?? columnIndex)
      : columnIndex;

    applySelectionRange(
      { rowIndex: startRowIndex, columnIndex: anchorColumnIndex },
      { rowIndex: endRowIndex, columnIndex },
    );
  }

  function handleInsertRow(afterRowIndex: number) {
    insertRow(afterRowIndex + 1);
  }

  function handleInsertRowAbove(rowIndex: number) {
    insertRow(rowIndex);
  }

  function findNextSelectedRowAfterDeletion(rowIndices: number[], preferredRowIndex: number) {
    if (filteredRowEntries.length === 0) {
      return null;
    }

    const deletedRowSet = new Set(rowIndices);
    const preferredVisibleIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === preferredRowIndex);
    const startingVisibleIndex = preferredVisibleIndex >= 0 ? preferredVisibleIndex : 0;
    const nextVisibleEntry = filteredRowEntries.slice(startingVisibleIndex + 1).find((entry) => !deletedRowSet.has(entry.rowIndex))
      ?? filteredRowEntries.slice(0, startingVisibleIndex).reverse().find((entry) => !deletedRowSet.has(entry.rowIndex));

    if (!nextVisibleEntry) {
      return null;
    }

    const deletedBeforeCount = rowIndices.filter((rowIndex) => rowIndex < nextVisibleEntry.rowIndex).length;
    return nextVisibleEntry.rowIndex - deletedBeforeCount;
  }

  function findNextSelectedColumnAfterDeletion(columnIndices: number[], preferredColumnIndex: number) {
    if (activeSheetColumns.length - columnIndices.length <= 0) {
      return null;
    }

    const deletedColumnSet = new Set(columnIndices);
    const allColumnIndices = Array.from({ length: activeSheetColumns.length }, (_, columnIndex) => columnIndex);
    const nextOldColumnIndex = allColumnIndices.find(
      (columnIndex) => columnIndex > preferredColumnIndex && !deletedColumnSet.has(columnIndex),
    ) ?? [...allColumnIndices].reverse().find(
      (columnIndex) => columnIndex < preferredColumnIndex && !deletedColumnSet.has(columnIndex),
    );

    if (nextOldColumnIndex === undefined) {
      return null;
    }

    const deletedBeforeCount = columnIndices.filter((columnIndex) => columnIndex < nextOldColumnIndex).length;
    return nextOldColumnIndex - deletedBeforeCount;
  }

  function deleteSelectedRowsFromSelection(rowIndices: number[], preferredRowIndex: number) {
    if (rowIndices.length === 0) {
      return;
    }

    const normalizedRowIndices = Array.from(new Set(rowIndices)).sort((left, right) => left - right);
    const nextRowIndex = findNextSelectedRowAfterDeletion(normalizedRowIndices, preferredRowIndex);
    deleteRows(normalizedRowIndices);

    if (nextRowIndex === null || activeSheetColumns.length === 0) {
      setSelectedCell(null);
      setSelectionAnchor(null);
      return;
    }

    applySelectionRange(
      { rowIndex: nextRowIndex, columnIndex: 0 },
      { rowIndex: nextRowIndex, columnIndex: activeSheetColumns.length - 1 },
    );
  }

  function deleteSelectedColumnsFromSelection(columnIndices: number[], preferredColumnIndex: number) {
    if (columnIndices.length === 0) {
      return;
    }

    const normalizedColumnIndices = Array.from(new Set(columnIndices)).sort((left, right) => left - right);
    const nextColumnIndex = findNextSelectedColumnAfterDeletion(normalizedColumnIndices, preferredColumnIndex);
    deleteColumns(normalizedColumnIndices);

    if (nextColumnIndex === null || filteredRowEntries.length === 0) {
      setSelectedCell(null);
      setSelectionAnchor(null);
      return;
    }

    applySelectionRange(
      { rowIndex: filteredRowEntries[0].rowIndex, columnIndex: nextColumnIndex },
      { rowIndex: filteredRowEntries[filteredRowEntries.length - 1].rowIndex, columnIndex: nextColumnIndex },
    );
  }

  function handleDeleteRow(rowIndex: number) {
    const targetRowIndices = isFullRowSelection && selectedRangeRowEntries.some((entry) => entry.rowIndex === rowIndex)
      ? selectedRangeRowEntries.map((entry) => entry.rowIndex)
      : [rowIndex];

    if (targetRowIndices.length > 1) {
      deleteSelectedRowsFromSelection(targetRowIndices, rowIndex);
      return;
    }

    deleteRow(rowIndex);

    const nextRowIndex = findNextSelectedRowAfterDeletion(targetRowIndices, rowIndex);
    if (nextRowIndex === null || activeSheetColumns.length === 0) {
      setSelectedCell(null);
      setSelectionAnchor(null);
      return;
    }

    applySelectionRange(
      { rowIndex: nextRowIndex, columnIndex: 0 },
      { rowIndex: nextRowIndex, columnIndex: activeSheetColumns.length - 1 },
    );
  }

  function handleInsertCopiedRows(atRowIndex: number) {
    if (!copiedSelectionSnapshot?.canInsertRows) {
      return;
    }

    insertCopiedRows(atRowIndex, copiedSelectionSnapshot.matrix);
    const insertedRowCount = copiedSelectionSnapshot.matrix.length;
    if (insertedRowCount <= 0 || activeSheetColumns.length === 0) {
      return;
    }

    applySelectionRange(
      { rowIndex: atRowIndex, columnIndex: 0 },
      { rowIndex: atRowIndex + insertedRowCount - 1, columnIndex: activeSheetColumns.length - 1 },
    );
  }

  function handleInsertColumn(afterColumnIndex: number) {
    insertColumn(afterColumnIndex + 1);
  }

  function handleInsertColumnBefore(columnIndex: number) {
    insertColumn(columnIndex);
  }

  function handleDeleteColumn(columnIndex: number) {
    if (activeSheetColumns.length <= 1) {
      return;
    }

    const targetColumnIndices = isFullColumnSelection && selectedColumnIndices.includes(columnIndex)
      ? selectedColumnIndices
      : [columnIndex];

    if (targetColumnIndices.length > 1) {
      deleteSelectedColumnsFromSelection(targetColumnIndices, columnIndex);
      return;
    }

    deleteColumn(columnIndex);

    if (filteredRowEntries.length === 0) {
      setSelectedCell(null);
      setSelectionAnchor(null);
      return;
    }

    const nextColumnIndex = Math.max(0, Math.min(columnIndex, activeSheetColumns.length - 2));
    applySelectionRange(
      { rowIndex: filteredRowEntries[0].rowIndex, columnIndex: nextColumnIndex },
      { rowIndex: filteredRowEntries[filteredRowEntries.length - 1].rowIndex, columnIndex: nextColumnIndex },
    );
  }

  function handleInsertCopiedColumns(atColumnIndex: number) {
    if (!copiedSelectionSnapshot?.canInsertColumns) {
      return;
    }

    insertCopiedColumns(atColumnIndex, copiedSelectionSnapshot.copiedColumns, copiedSelectionSnapshot.matrix);
    const insertedColumnCount = copiedSelectionSnapshot.copiedColumns.length;
    if (insertedColumnCount <= 0 || activeSheetRows.length === 0) {
      return;
    }

    applySelectionRange(
      { rowIndex: 0, columnIndex: atColumnIndex },
      { rowIndex: activeSheetRows.length - 1, columnIndex: atColumnIndex + insertedColumnCount - 1 },
    );
  }

  function handleOpenColumnEditor(columnIndex: number) {
    if (columnIndex < 0 || columnIndex >= activeSheetColumns.length) {
      return;
    }

    setEditingColumnIndex(columnIndex);
  }

  function handleCloseColumnEditor() {
    setEditingColumnIndex(null);
  }

  function handleSaveColumnDefinition(columnIndex: number, nextColumn: SheetColumn) {
    updateColumnDefinition(columnIndex, nextColumn);
  }

  function handleOpenCreateSheetDialog(workbookName: string) {
    setFocusedWorkbookName(workbookName);
    setSheetDialogWorkbookName(workbookName);
    setNewSheetName("NewSheet");
    setIsCreateSheetDialogOpen(true);
    setWorkbookContextMenu(null);
    setSheetContextMenu(null);
  }

  function handleCloseCreateSheetDialog() {
    setIsCreateSheetDialogOpen(false);
    setSheetDialogWorkbookName(null);
    setNewSheetName("NewSheet");
  }

  async function handleConfirmCreateSheet() {
    if (!sheetDialogWorkbookName) {
      return;
    }

    const created = await createSheet(sheetDialogWorkbookName, newSheetName);
    if (created) {
      handleCloseCreateSheetDialog();
    }
  }

  async function handleDeleteSheet(workbookName: string, sheetName: string) {
    setSheetContextMenu(null);
    await deleteSheet(workbookName, sheetName);
  }

  function handleOpenWorkbookContextMenu(event: React.MouseEvent<HTMLButtonElement>, workbookName: string) {
    event.preventDefault();
    setWorkbookContextMenu({
      workbookName,
      x: event.clientX,
      y: event.clientY,
    });
    setSheetContextMenu(null);
  }

  function handleCloseWorkbookContextMenu() {
    setWorkbookContextMenu(null);
  }

  function handleOpenRenameSheetDialog(workbookName: string, sheetName: string) {
    setRenameSheetTarget({ workbookName, sheetName });
    setRenameSheetName(sheetName);
    setIsRenameSheetDialogOpen(true);
    setWorkbookContextMenu(null);
    setSheetContextMenu(null);
  }

  function handleOpenEditWorkbookAliasDialog(workbookName: string) {
    const workbook = workbookTree.find((w) => w.name === workbookName) ?? null;
    setEditWorkbookAliasTarget(workbookName);
    setEditWorkbookAliasValue(workbook?.alias ?? "");
    setIsEditWorkbookAliasDialogOpen(true);
    setWorkbookContextMenu(null);
    setSheetContextMenu(null);
  }

  function handleCloseEditWorkbookAliasDialog() {
    setIsEditWorkbookAliasDialogOpen(false);
    setEditWorkbookAliasTarget(null);
    setEditWorkbookAliasValue("");
  }

  async function handleConfirmEditWorkbookAlias() {
    if (!editWorkbookAliasTarget) {
      return;
    }

    const alias = editWorkbookAliasValue.trim();
    await setWorkbookAlias(editWorkbookAliasTarget, alias === "" ? null : alias);
    handleCloseEditWorkbookAliasDialog();
  }

  function handleOpenEditSheetAliasDialog(workbookName: string, sheetName: string) {
    const workbook = workbookTree.find((w) => w.name === workbookName) ?? null;
    const sheet = workbook?.sheets.find((s) => s.sheetName === sheetName) ?? null;
    setEditSheetAliasTarget({ workbookName, sheetName });
    setEditSheetAliasValue(sheet?.alias ?? "");
    setIsEditSheetAliasDialogOpen(true);
    setWorkbookContextMenu(null);
    setSheetContextMenu(null);
  }

  function handleCloseEditSheetAliasDialog() {
    setIsEditSheetAliasDialogOpen(false);
    setEditSheetAliasTarget(null);
    setEditSheetAliasValue("");
  }

  async function handleConfirmEditSheetAlias() {
    if (!editSheetAliasTarget) {
      return;
    }

    const alias = editSheetAliasValue.trim();
    await setSheetAlias(editSheetAliasTarget.workbookName, editSheetAliasTarget.sheetName, alias === "" ? null : alias);
    handleCloseEditSheetAliasDialog();
  }

  function handleCloseRenameSheetDialog() {
    setIsRenameSheetDialogOpen(false);
    setRenameSheetTarget(null);
    setRenameSheetName("");
  }

  async function handleConfirmRenameSheet() {
    if (!renameSheetTarget) {
      return;
    }

    const renamed = await renameSheet(renameSheetTarget.workbookName, renameSheetTarget.sheetName, renameSheetName);
    if (renamed) {
      handleCloseRenameSheetDialog();
    }
  }

  function handleOpenSheetContextMenu(event: React.MouseEvent<HTMLButtonElement>, workbookName: string, sheetName: string) {
    event.preventDefault();
    setSheetContextMenu({
      workbookName,
      sheetName,
      x: event.clientX,
      y: event.clientY,
    });
    setWorkbookContextMenu(null);
  }

  function handleCloseSheetContextMenu() {
    setSheetContextMenu(null);
  }

  function handleConvertWorkbookCode(workbookName: string) {
    setFocusedWorkbookName(workbookName);
    setCodegenDialogMode("single");
    setCodegenWorkbookName(workbookName);
    setCodegenOutputRelativePath(workspaceCodegenOutputRelativePath);
    setIsCodegenDialogOpen(true);
    setWorkbookContextMenu(null);
  }

  function handleCloseCodegenDialog() {
    setIsCodegenDialogOpen(false);
    setCodegenDialogMode("single");
    setCodegenWorkbookName(null);
    setCodegenOutputRelativePath("");
  }

  async function handleSaveWorkspaceCodegenConfig() {
    const saved = await saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (saved) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportWorkbookCode() {
    if (!codegenWorkbookName) {
      return;
    }

    const saved = await saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await exportWorkbookCode(codegenWorkbookName);
    if (exported) {
      handleCloseCodegenDialog();
    }
  }

  async function handleConfirmExportAllWorkbookCode() {
    const saved = await saveWorkspaceCodegenOptions(codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await exportAllWorkbookCode();
    if (exported) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportAllWorkbookCode() {
    closeToolbarMenu();

    if (!workspaceCodegenOutputRelativePath.trim()) {
      setCodegenDialogMode("all");
      setCodegenWorkbookName(null);
      setCodegenOutputRelativePath("");
      setIsCodegenDialogOpen(true);
      return;
    }

    await exportAllWorkbookCode();
  }

  async function handleChooseCodegenOutputDirectory() {
    if (!window.lightyDesign) {
      pushToastNotification({
        title: "无法选择输出目录",
        detail: bridgeError ?? "当前环境不支持原生目录选择。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    if (!workspacePath) {
      pushToastNotification({
        title: "无法选择输出目录",
        detail: "请先打开一个工作区。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return;
    }

    try {
      const selectedPath = await window.lightyDesign.chooseWorkspaceDirectory();
      if (!selectedPath) {
        return;
      }

      const relativePath = tryGetWorkspaceRelativePath(workspacePath, selectedPath);
      if (relativePath === null) {
        pushToastNotification({
          title: "输出目录必须与工作区位于同一硬盘",
          detail: `已选择目录: ${selectedPath}\n工作区目录: ${workspacePath}`,
          source: "system",
          variant: "error",
          canOpenDetail: true,
          durationMs: 8000,
        });
        return;
      }

      setCodegenOutputRelativePath(relativePath);
    } catch (error) {
      pushToastNotification({
        title: "无法选择输出目录",
        detail: error instanceof Error ? error.message : "打开输出目录选择器失败。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  async function handleValidateColumnType(type: string) {
    if (!hostInfo || !workspacePath) {
      return {
        ok: false,
        message: "工作区未连接，无法校验 Type。",
      };
    }

    const query = new URLSearchParams({
      type,
      workspacePath,
      workbookName: activeTab?.workbookName ?? "",
    });

    try {
      const response = await fetch(`${hostInfo.desktopHostUrl}/api/workspace/type-validation?${query.toString()}`);
      const payload = await response.json() as {
        error?: string;
        normalizedType?: string;
        descriptor?: import("./types/desktopApp").TypeDescriptorResponse;
      };

      if (!response.ok) {
        return {
          ok: false,
          message: payload.error ?? `Type 校验失败: ${response.status}`,
        };
      }

      return {
        ok: true,
        normalizedType: payload.normalizedType,
        descriptor: payload.descriptor,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Type 校验失败。",
      };
    }
  }

  function handleAppendRow() {
    const nextRowIndex = activeSheetRows.length;
    insertRow(nextRowIndex);

    if (!sheetFilter.trim()) {
      applySelectionRange(
        { rowIndex: nextRowIndex, columnIndex: selectedCell?.columnIndex ?? 0 },
        { rowIndex: nextRowIndex, columnIndex: selectedCell?.columnIndex ?? 0 },
      );
    }
  }

  function handleAppendColumn() {
    const nextColumnIndex = activeSheetColumns.length;
    insertColumn(nextColumnIndex);
    applySelectionRange(
      { rowIndex: selectedCell?.rowIndex ?? 0, columnIndex: nextColumnIndex },
      { rowIndex: selectedCell?.rowIndex ?? 0, columnIndex: nextColumnIndex },
    );
  }

  function handleInsertCopiedCellsDown(startRowIndex: number, startColumnIndex: number) {
    if (!copiedSelectionSnapshot) {
      return;
    }

    insertCopiedCellsDown(startRowIndex, startColumnIndex, copiedSelectionSnapshot.matrix);
    const insertedRowCount = copiedSelectionSnapshot.matrix.length;
    const insertedColumnCount = copiedSelectionSnapshot.matrix.reduce((max, row) => Math.max(max, row.length), 0);
    if (insertedRowCount <= 0 || insertedColumnCount <= 0) {
      return;
    }

    applySelectionRange(
      { rowIndex: startRowIndex, columnIndex: startColumnIndex },
      {
        rowIndex: startRowIndex + insertedRowCount - 1,
        columnIndex: Math.min(startColumnIndex + insertedColumnCount - 1, activeSheetColumns.length - 1),
      },
    );
  }

  function handleAutoFillSelection(targetRowIndex: number, targetColumnIndex: number) {
    if (!activeSheetData || !selectedRangeBounds || selectedRangeRowEntries.length === 0) {
      return;
    }

    const sourceStartVisibleIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === selectedRangeRowEntries[0]?.rowIndex);
    const sourceEndVisibleIndex = filteredRowEntries.findIndex(
      (entry) => entry.rowIndex === selectedRangeRowEntries[selectedRangeRowEntries.length - 1]?.rowIndex,
    );
    const targetVisibleIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === targetRowIndex);
    if (sourceStartVisibleIndex < 0 || sourceEndVisibleIndex < 0 || targetVisibleIndex < 0) {
      return;
    }

    const sourceColumnCount = selectedRangeBounds.endColumnIndex - selectedRangeBounds.startColumnIndex + 1;
    if (sourceColumnCount <= 0) {
      return;
    }

    const destinationStartVisibleIndex = Math.min(sourceStartVisibleIndex, targetVisibleIndex);
    const destinationEndVisibleIndex = Math.max(sourceEndVisibleIndex, targetVisibleIndex);
    const destinationStartColumnIndex = Math.min(selectedRangeBounds.startColumnIndex, targetColumnIndex);
    const destinationEndColumnIndex = Math.max(selectedRangeBounds.endColumnIndex, targetColumnIndex);

    const sourceMatrix = selectedRangeRowEntries.map((entry) =>
      Array.from({ length: sourceColumnCount }, (_, columnOffset) => entry.row[selectedRangeBounds.startColumnIndex + columnOffset] ?? ""),
    );
    const sourceRowCount = sourceMatrix.length;
    if (sourceRowCount === 0) {
      return;
    }

    const isVerticalOnlyExpansion =
      destinationStartColumnIndex === selectedRangeBounds.startColumnIndex &&
      destinationEndColumnIndex === selectedRangeBounds.endColumnIndex;
    const isHorizontalOnlyExpansion =
      destinationStartVisibleIndex === sourceStartVisibleIndex &&
      destinationEndVisibleIndex === sourceEndVisibleIndex;
    const columnSeriesGenerators = isVerticalOnlyExpansion
      ? Array.from({ length: sourceColumnCount }, (_, columnOffset) =>
        buildAutoFillSeriesGenerator(
          sourceMatrix.map((row) => row[columnOffset] ?? ""),
        ),
      )
      : [];
    const rowSeriesGenerators = isHorizontalOnlyExpansion
      ? Array.from({ length: sourceRowCount }, (_, rowOffset) => buildAutoFillSeriesGenerator(sourceMatrix[rowOffset] ?? []))
      : [];

    const edits = filteredRowEntries.slice(destinationStartVisibleIndex, destinationEndVisibleIndex + 1).flatMap((entry, rowOffset) => {
      const visibleRowIndex = destinationStartVisibleIndex + rowOffset;

      return Array.from(
        { length: destinationEndColumnIndex - destinationStartColumnIndex + 1 },
        (_, columnOffset) => destinationStartColumnIndex + columnOffset,
      ).flatMap((columnIndex) => {
        const isInsideSourceRange =
          visibleRowIndex >= sourceStartVisibleIndex &&
          visibleRowIndex <= sourceEndVisibleIndex &&
          columnIndex >= selectedRangeBounds.startColumnIndex &&
          columnIndex <= selectedRangeBounds.endColumnIndex;
        if (isInsideSourceRange) {
          return [];
        }

        const sourceRowOffset = visibleRowIndex - sourceStartVisibleIndex;
        const sourceColumnOffset = columnIndex - selectedRangeBounds.startColumnIndex;
        const repeatedFillValue = buildRepeatedFillValue(
          sourceMatrix,
          sourceStartVisibleIndex,
          visibleRowIndex,
          selectedRangeBounds.startColumnIndex,
          columnIndex,
        );
        const nextValue = isVerticalOnlyExpansion
          ? columnSeriesGenerators[sourceColumnOffset]?.(sourceRowOffset) ?? repeatedFillValue
          : isHorizontalOnlyExpansion
            ? rowSeriesGenerators[sourceRowOffset]?.(sourceColumnOffset) ?? repeatedFillValue
            : repeatedFillValue;

        return {
          rowIndex: entry.rowIndex,
          columnIndex,
          nextValue,
        };
      });
    });

    if (edits.length === 0) {
      return;
    }

    applyCellEdits(edits);
    applySelectionRange(
      {
        rowIndex: filteredRowEntries[destinationStartVisibleIndex]?.rowIndex ?? selectedRangeRowEntries[0].rowIndex,
        columnIndex: destinationStartColumnIndex,
      },
      {
        rowIndex: filteredRowEntries[destinationEndVisibleIndex]?.rowIndex ?? selectedRangeRowEntries[selectedRangeRowEntries.length - 1].rowIndex,
        columnIndex: destinationEndColumnIndex,
      },
    );
  }

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "save-active-workbook",
        label: "保存当前工作簿",
        hint: "Ctrl+S",
        enabled: canSaveActiveWorkbook,
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "s",
        run: () => {
          void saveActiveWorkbook();
        },
      },
      {
        id: "undo-sheet-edit",
        label: "撤销当前 Sheet 编辑",
        hint: "Ctrl+Z",
        enabled: canUndoActiveSheet,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "z",
        run: undoActiveSheetEdit,
      },
      {
        id: "redo-sheet-edit",
        label: "恢复当前 Sheet 编辑",
        hint: "Ctrl+Y / Ctrl+Shift+Z",
        enabled: canRedoActiveSheet,
        matches: (event) =>
          isShortcutModifierPressed(event) &&
          ((event.key.toLowerCase() === "y" && !event.shiftKey) || (event.key.toLowerCase() === "z" && event.shiftKey)),
        run: redoActiveSheetEdit,
      },
      {
        id: "select-all-cells",
        label: "选择当前 Sheet 可见区域",
        hint: "Ctrl+A",
        enabled: Boolean(activeSheetData && filteredRowEntries.length > 0),
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "a",
        run: handleSelectAll,
      },
      {
        id: "copy-selected-cells",
        label: "复制选区",
        hint: "Ctrl+C",
        enabled: Boolean(selectedCell),
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "c",
        run: () => {
          void handleCopySelectionToClipboard();
        },
      },
      {
        id: "cut-selected-cells",
        label: "剪切选区",
        hint: "Ctrl+X",
        enabled: Boolean(selectedCell),
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "x",
        run: () => {
          void handleCutSelection();
        },
      },
      {
        id: "clear-selected-cells",
        label: "清空选区",
        hint: "Delete",
        enabled: Boolean(selectedCell),
        matches: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Delete",
        run: handleClearSelectionContents,
      },
    ],
    [activeSheetData, canRedoActiveSheet, canSaveActiveWorkbook, canUndoActiveSheet, filteredRowEntries.length, redoActiveSheetEdit, saveActiveWorkbook, selectedCell, undoActiveSheetEdit],
  );

  useEditorShortcuts(shortcutBindings);

  const saveStatusText =
    activeWorkbookSaveState?.status === "saving"
      ? "正在保存"
      : activeWorkbookSaveState?.status === "saved"
        ? "已保存"
        : activeWorkbookSaveState?.status === "error"
          ? activeWorkbookSaveState.error ?? "保存失败"
          : activeWorkbookDirtyTabs.length > 0
            ? `${activeWorkbookDirtyTabs.length} 个标签未保存`
            : "无未保存更改";

  const selectionRange = useMemo<SheetSelectionRange | null>(() => {
    if (!selectedCell) {
      return null;
    }

    return {
      anchor: selectionAnchor ?? selectedCell,
      focus: selectedCell,
    };
  }, [selectedCell, selectionAnchor]);
  const appliedFreezeRowCount = Math.max(0, Math.min(freezeRowCount, filteredRowEntries.length));
  const appliedFreezeColumnCount = Math.max(0, Math.min(freezeColumnCount, activeSheetColumns.length));
  const activeColumnWidths = useMemo(() => {
    if (!activeTab || !activeSheetData) {
      return [];
    }

    const existing = columnWidthsBySheet[activeTab.id] ?? [];
    return activeSheetColumns.map((_, columnIndex) => {
      const width = existing[columnIndex] ?? defaultColumnWidth;
      return Math.max(minColumnWidth, Math.min(width, maxColumnWidth));
    });
  }, [activeSheetColumns, activeSheetData, activeTab, columnWidthsBySheet]);
  const freezeStatusText = appliedFreezeRowCount > 0 || appliedFreezeColumnCount > 0
    ? `冻结 ${appliedFreezeRowCount} 行 / ${appliedFreezeColumnCount} 列`
    : "未冻结";
  const canEditActiveSheet = Boolean(activeSheetData);

  useEffect(() => {
    if (!activeSheetData || filteredRowEntries.length === 0) {
      setSelectedCell(null);
      setSelectionAnchor(null);
      return;
    }

    const hasSelection =
      selectedCell &&
      selectedCell.columnIndex < activeSheetColumns.length &&
      filteredRowEntries.some((entry) => entry.rowIndex === selectedCell.rowIndex);

    if (!hasSelection) {
      const nextSelection = {
        rowIndex: filteredRowEntries[0].rowIndex,
        columnIndex: 0,
      };

      setSelectedCell(nextSelection);
      setSelectionAnchor(nextSelection);
    }
  }, [activeSheetColumns.length, activeSheetData, filteredRowEntries, selectedCell]);

  useEffect(() => {
    if (!selectedCell) {
      setSelectionAnchor(null);
      return;
    }

    if (!selectionAnchor) {
      setSelectionAnchor(selectedCell);
    }
  }, [selectedCell, selectionAnchor]);

  useEffect(() => {
    setFreezeRowCount((current) => Math.max(0, Math.min(current, filteredRowEntries.length)));
  }, [filteredRowEntries.length]);

  useEffect(() => {
    setFreezeColumnCount((current) => Math.max(0, Math.min(current, activeSheetColumns.length)));
  }, [activeSheetColumns.length]);

  useEffect(() => {
    if (!activeTab || !activeSheetData) {
      return;
    }

    setColumnWidthsBySheet((current) => {
      const existing = current[activeTab.id] ?? [];
      const next = activeSheetColumns.map((_, columnIndex) => {
        const width = existing[columnIndex] ?? defaultColumnWidth;
        return Math.max(minColumnWidth, Math.min(width, maxColumnWidth));
      });

      if (
        existing.length === next.length &&
        existing.every((width, columnIndex) => width === next[columnIndex])
      ) {
        return current;
      }

      return {
        ...current,
        [activeTab.id]: next,
      };
    });
  }, [activeSheetColumns, activeSheetData, activeTab]);

  useEffect(() => {
    if (!workspacePath || !activeTab) {
      return;
    }

    const columnWidthStorageKey = buildWorkspaceScopedStorageKey(workspacePath, `sheet-widths:${activeTab.id}`);

    try {
      const rawValue = localStorage.getItem(columnWidthStorageKey);
      if (!rawValue) {
        return;
      }

      const parsed = JSON.parse(rawValue) as number[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setColumnWidthsBySheet((current) => ({
        ...current,
        [activeTab.id]: parsed.map((width) => Math.max(minColumnWidth, Math.min(Number(width) || defaultColumnWidth, maxColumnWidth))),
      }));
    } catch {
      // ignore invalid persisted widths
    }
  }, [activeTab, workspacePath]);

  useEffect(() => {
    if (!workspacePath || !activeTab || activeColumnWidths.length === 0) {
      return;
    }

    const columnWidthStorageKey = buildWorkspaceScopedStorageKey(workspacePath, `sheet-widths:${activeTab.id}`);
    localStorage.setItem(columnWidthStorageKey, JSON.stringify(activeColumnWidths));
  }, [activeColumnWidths, activeTab, workspacePath]);

  useEffect(() => {
    setSheetFilter("");
  }, [activeTabId, setSheetFilter]);

  useEffect(() => {
    if (!workspacePath || !activeTab) {
      return;
    }

    const freezeStorageKey = buildWorkspaceScopedStorageKey(workspacePath, `sheet-freeze:${activeTab.id}`);

    try {
      const rawValue = localStorage.getItem(freezeStorageKey);
      if (!rawValue) {
        setFreezeRowCount(0);
        setFreezeColumnCount(0);
        return;
      }

      const parsed = JSON.parse(rawValue) as { rowCount?: number; columnCount?: number };
      setFreezeRowCount(Math.max(0, parsed.rowCount ?? 0));
      setFreezeColumnCount(Math.max(0, parsed.columnCount ?? 0));
    } catch {
      setFreezeRowCount(0);
      setFreezeColumnCount(0);
    }
  }, [activeTab, workspacePath]);

  useEffect(() => {
    if (!workspacePath || !activeTab) {
      return;
    }

    const freezeStorageKey = buildWorkspaceScopedStorageKey(workspacePath, `sheet-freeze:${activeTab.id}`);
    localStorage.setItem(
      freezeStorageKey,
      JSON.stringify({
        rowCount: appliedFreezeRowCount,
        columnCount: appliedFreezeColumnCount,
      }),
    );
  }, [activeTab, appliedFreezeColumnCount, appliedFreezeRowCount, workspacePath]);

  const selectedRowEntry = selectedCell
    ? filteredRowEntries.find((entry) => entry.rowIndex === selectedCell.rowIndex) ?? null
    : null;
  const selectedColumn = selectedCell && activeSheetData
    ? activeSheetColumns[selectedCell.columnIndex] ?? null
    : null;
  const selectedRangeBounds = selectionRange ? getSelectionBounds(selectionRange) : null;
  const selectedRangeRowEntries = useMemo(() => {
    if (!selectionRange) {
      return [];
    }

    const anchorVisibleIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === selectionRange.anchor.rowIndex);
    const focusVisibleIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === selectionRange.focus.rowIndex);
    if (anchorVisibleIndex < 0 || focusVisibleIndex < 0) {
      return [];
    }

    const startVisibleIndex = Math.min(anchorVisibleIndex, focusVisibleIndex);
    const endVisibleIndex = Math.max(anchorVisibleIndex, focusVisibleIndex);
    return filteredRowEntries.slice(startVisibleIndex, endVisibleIndex + 1);
  }, [filteredRowEntries, selectionRange]);
  const selectedRangeColumnCount = selectedRangeBounds
    ? selectedRangeBounds.endColumnIndex - selectedRangeBounds.startColumnIndex + 1
    : 0;
  const selectedCellCount = selectedRangeRowEntries.length * selectedRangeColumnCount;
  const selectedRowCount = selectedRangeRowEntries.length;
  const selectedColumnIndices = useMemo(() => {
    if (!selectedRangeBounds) {
      return [] as number[];
    }

    return Array.from(
      { length: selectedRangeBounds.endColumnIndex - selectedRangeBounds.startColumnIndex + 1 },
      (_, offset) => selectedRangeBounds.startColumnIndex + offset,
    );
  }, [selectedRangeBounds]);
  const isFullRowSelection = Boolean(
    selectedRangeBounds &&
    activeSheetColumns.length > 0 &&
    selectedRangeBounds.startColumnIndex === 0 &&
    selectedRangeBounds.endColumnIndex === activeSheetColumns.length - 1 &&
    selectedRangeRowEntries.length > 0,
  );
  const isFullColumnSelection = Boolean(
    selectedRangeBounds &&
    filteredRowEntries.length > 0 &&
    selectedRangeRowEntries.length === filteredRowEntries.length &&
    selectedRangeBounds.startRowIndex === filteredRowEntries[0].rowIndex &&
    selectedRangeBounds.endRowIndex === filteredRowEntries[filteredRowEntries.length - 1].rowIndex &&
    selectedColumnIndices.length > 0,
  );
  const selectedEditTargets = useMemo(() => {
    if (!selectedRangeBounds || selectedRangeRowEntries.length === 0) {
      return [] as Array<{ rowIndex: number; columnIndex: number }>;
    }

    return selectedRangeRowEntries.flatMap((entry) => {
      const targets: Array<{ rowIndex: number; columnIndex: number }> = [];

      for (
        let columnIndex = selectedRangeBounds.startColumnIndex;
        columnIndex <= selectedRangeBounds.endColumnIndex;
        columnIndex += 1
      ) {
        targets.push({ rowIndex: entry.rowIndex, columnIndex });
      }

      return targets;
    });
  }, [selectedRangeBounds, selectedRangeRowEntries]);
  const selectedCellAddress = selectionRange ? formatSelectionAddress(selectionRange) : "—";
  const selectedCellValue = selectedCell && selectedRowEntry ? selectedRowEntry.row[selectedCell.columnIndex] ?? "" : "";
  const selectedCellDescription = selectedColumn
    ? `${selectedCellAddress} · ${selectedColumn.displayName || selectedColumn.fieldName}${selectedCellCount > 1 ? ` · ${selectedCellCount} cells` : ""}`
    : "未选择单元格";
  const selectionStatusText = selectedCellCount > 1
    ? `${selectedCellAddress} · ${selectedRowCount} × ${selectedRangeColumnCount} · ${selectedCellCount} 个单元格`
    : selectedColumn
      ? `${selectedCellAddress} · ${selectedColumn.fieldName}`
      : "未选择单元格";
  const currentSheetContext = useMemo(() => {
    if (!activeTab || !activeSheetData) {
      return null;
    }

    return {
      workbookName: activeTab.workbookName,
      sheetName: activeTab.sheetName,
      rowCount: activeSheetData.metadata.rowCount,
      columnCount: activeSheetData.metadata.columnCount,
      sheetFilter,
      dataFilePath: activeSheetData.metadata.dataFilePath,
      headerFilePath: activeSheetData.metadata.headerFilePath,
      columns: activeSheetColumns.map((column) => ({
        fieldName: column.fieldName,
        displayName: column.displayName ?? null,
        type: column.type,
        exportScope: column.attributes.ExportScope ?? null,
        isListType: column.isListType,
        isReferenceType: column.isReferenceType,
      })),
      selectionAddress: selectedCellAddress,
      selectionStatusText,
    };
  }, [activeSheetColumns, activeSheetData, activeTab, selectedCellAddress, selectionStatusText, sheetFilter]);
  const currentSelectionContext = useMemo(() => {
    if (!selectedRangeBounds || !activeTab || !activeSheetData || selectedRangeRowEntries.length === 0) {
      return null;
    }

    const columnStart = selectedRangeBounds.startColumnIndex;
    const visibleColumns = activeSheetColumns.slice(
      columnStart,
      Math.min(activeSheetColumns.length, columnStart + selectionContextColumnPreviewLimit),
    );
    const previewRows = selectedRangeRowEntries.slice(0, selectionContextRowPreviewLimit).map((entry) => ({
      rowIndex: entry.rowIndex,
      cells: visibleColumns.map((column, offset) => ({
        fieldName: column.fieldName,
        displayName: column.displayName ?? null,
        value: entry.row[columnStart + offset] ?? "",
      })),
    }));

    return {
      workbookName: activeTab.workbookName,
      sheetName: activeTab.sheetName,
      address: selectedCellAddress,
      statusText: selectionStatusText,
      rowCount: selectedRowCount,
      columnCount: selectedRangeColumnCount,
      cellCount: selectedCellCount,
      bounds: {
        startRowIndex: selectedRangeBounds.startRowIndex,
        endRowIndex: selectedRangeBounds.endRowIndex,
        startColumnIndex: selectedRangeBounds.startColumnIndex,
        endColumnIndex: selectedRangeBounds.endColumnIndex,
      },
      columns: visibleColumns.map((column) => ({
        fieldName: column.fieldName,
        displayName: column.displayName ?? null,
        type: column.type,
      })),
      previewRows,
      isRowPreviewTruncated: selectedRangeRowEntries.length > selectionContextRowPreviewLimit,
      isColumnPreviewTruncated: selectedRangeColumnCount > selectionContextColumnPreviewLimit,
    };
  }, [activeSheetColumns, activeSheetData, activeTab, selectedCellAddress, selectedCellCount, selectedRangeBounds, selectedRangeColumnCount, selectedRangeRowEntries, selectedRowCount, selectionStatusText]);
  const activeEditorContext = useMemo(() => ({
    appActive: true,
    workspacePath: workspacePath || null,
    focusedWorkbookName,
    currentSheet: currentSheetContext,
    selection: currentSelectionContext,
  }), [currentSelectionContext, currentSheetContext, focusedWorkbookName, workspacePath]);

  async function handleCopyCurrentSheetContextJson() {
    if (!currentSheetContext) {
      return;
    }

    const written = await writeClipboardText(JSON.stringify(currentSheetContext, null, 2));
    if (!written) {
      return;
    }

    pushToastNotification({
      title: "当前 Sheet 上下文已复制",
      detail: `${currentSheetContext.workbookName} / ${currentSheetContext.sheetName}`,
      source: "system",
      variant: "success",
      canOpenDetail: false,
      durationMs: 3200,
    });
  }

  async function handleCopyCurrentSelectionContextJson() {
    if (!currentSelectionContext) {
      return;
    }

    const written = await writeClipboardText(JSON.stringify(currentSelectionContext, null, 2));
    if (!written) {
      return;
    }

    pushToastNotification({
      title: "当前选区上下文已复制",
      detail: currentSelectionContext.address,
      source: "system",
      variant: "success",
      canOpenDetail: false,
      durationMs: 3200,
    });
  }

  function handleResizeColumn(columnIndex: number, nextWidth: number) {
    if (!activeTab || !activeSheetData) {
      return;
    }

    setColumnWidthsBySheet((current) => {
      const baseWidths = current[activeTab.id] ?? activeSheetColumns.map(() => defaultColumnWidth);
      const nextWidths = [...baseWidths];
      nextWidths[columnIndex] = Math.max(minColumnWidth, Math.min(nextWidth, maxColumnWidth));

      return {
        ...current,
        [activeTab.id]: nextWidths,
      };
    });
  }

  function handleAutoSizeColumn(columnIndex: number) {
    if (!activeSheetData) {
      return;
    }

    const column = activeSheetColumns[columnIndex];
    const sampledRows = filteredRowEntries.slice(0, columnWidthSampleLimit);
    const contentWidth = sampledRows.reduce((maxWidth, entry) => {
      const value = entry.row[columnIndex] ?? "";
      return Math.max(maxWidth, measureTextWidth(value));
    }, 0);
    const headerWidth = Math.max(
      measureTextWidth(column.displayName || column.fieldName, '12px "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif'),
      measureTextWidth(column.type, '11px "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif'),
    );
    const nextWidth = Math.ceil(Math.max(contentWidth, headerWidth) + 30);
    handleResizeColumn(columnIndex, Math.max(defaultColumnWidth, nextWidth));
  }

  function handleClearSelectionContents() {
    if (selectedEditTargets.length === 0) {
      return;
    }

    applyCellEdits(
      selectedEditTargets.map((target) => ({
        rowIndex: target.rowIndex,
        columnIndex: target.columnIndex,
        nextValue: "",
      })),
    );
  }

  async function handleCutSelection() {
    const copiedText = handleCopySelection();
    if (!copiedText) {
      return;
    }

    const written = await writeClipboardText(copiedText);
    if (!written) {
      return;
    }

    if (isFullRowSelection) {
      deleteSelectedRowsFromSelection(
        selectedRangeRowEntries.map((entry) => entry.rowIndex),
        selectedCell?.rowIndex ?? selectedRangeRowEntries[0]?.rowIndex ?? 0,
      );
      return;
    }

    if (isFullColumnSelection) {
      deleteSelectedColumnsFromSelection(
        selectedColumnIndices,
        selectedCell?.columnIndex ?? selectedColumnIndices[0] ?? 0,
      );
      return;
    }

    handleClearSelectionContents();
  }

  async function handleCopySelectionToClipboard() {
    const copiedText = handleCopySelection();
    if (!copiedText) {
      return;
    }

    await writeClipboardText(copiedText);
  }

  function handleSelectCell(rowIndex: number, columnIndex: number, options?: { extendSelection?: boolean }) {
    const nextSelection = { rowIndex, columnIndex };
    setSelectedCell(nextSelection);

    if (!options?.extendSelection) {
      setSelectionAnchor(nextSelection);
    } else if (!selectionAnchor) {
      setSelectionAnchor(selectedCell ?? nextSelection);
    }
  }

  function handleCopySelection() {
    if (!selectedRangeBounds || selectedRangeRowEntries.length === 0) {
      return "";
    }

    const matrix = selectedRangeRowEntries.map((entry) => {
      const values: string[] = [];

      for (
        let columnIndex = selectedRangeBounds.startColumnIndex;
        columnIndex <= selectedRangeBounds.endColumnIndex;
        columnIndex += 1
      ) {
        values.push(entry.row[columnIndex] ?? "");
      }

      return values;
    });

    const isFullRowSelection =
      selectedRangeBounds.startColumnIndex === 0 &&
      selectedRangeBounds.endColumnIndex === activeSheetColumns.length - 1;
    const isFullColumnSelection =
      filteredRowEntries.length > 0 &&
      selectedRangeRowEntries.length === filteredRowEntries.length &&
      selectedRangeBounds.startRowIndex === filteredRowEntries[0].rowIndex &&
      selectedRangeBounds.endRowIndex === filteredRowEntries[filteredRowEntries.length - 1].rowIndex;

    setCopiedSelectionSnapshot({
      matrix,
      copiedColumns: cloneColumns(activeSheetColumns.slice(selectedRangeBounds.startColumnIndex, selectedRangeBounds.endColumnIndex + 1)),
      canInsertRows: isFullRowSelection,
      canInsertColumns: isFullColumnSelection,
    });

    return matrix.map((row) => row.join("\t")).join("\n");
  }

  async function handlePasteSelection(startRowIndex: number, startColumnIndex: number, clipboardText: string) {
    if (!activeSheetData) {
      return;
    }

    const clipboardMatrix = parseClipboardMatrix(clipboardText);
    if (clipboardMatrix.length === 0 || clipboardMatrix.every((row) => row.length === 1 && row[0] === "")) {
      return;
    }

    const startVisibleRowIndex = filteredRowEntries.findIndex((entry) => entry.rowIndex === startRowIndex);
    if (startVisibleRowIndex < 0) {
      return;
    }

    const edits = clipboardMatrix.flatMap((rowValues, rowOffset) => {
      const targetRowEntry = filteredRowEntries[startVisibleRowIndex + rowOffset];
      if (!targetRowEntry) {
        return [];
      }

      return rowValues.flatMap((value, columnOffset) => {
        const targetColumnIndex = startColumnIndex + columnOffset;
        if (targetColumnIndex >= activeSheetColumns.length) {
          return [];
        }

        return {
          rowIndex: targetRowEntry.rowIndex,
          columnIndex: targetColumnIndex,
          nextValue: value,
        };
      });
    });

    if (edits.length === 0) {
      return;
    }

    applyCellEdits(edits);

    const lastVisibleRowOffset = Math.min(clipboardMatrix.length - 1, filteredRowEntries.length - startVisibleRowIndex - 1);
    const lastVisibleRow = filteredRowEntries[startVisibleRowIndex + lastVisibleRowOffset];
    const widestRowLength = clipboardMatrix.reduce((max, rowValues) => Math.max(max, rowValues.length), 0);
    const lastColumnIndex = Math.min(startColumnIndex + Math.max(0, widestRowLength - 1), activeSheetColumns.length - 1);

    setSelectionAnchor({ rowIndex: startRowIndex, columnIndex: startColumnIndex });
    setSelectedCell({ rowIndex: lastVisibleRow.rowIndex, columnIndex: lastColumnIndex });

    setCopiedSelectionSnapshot(null);

    try {
      await navigator.clipboard.writeText("");
    } catch {
      // Ignore clipboard cleanup failures after paste.
    }
  }

  async function handlePasteSelectionFromClipboard(startRowIndex: number, startColumnIndex: number) {
    const clipboardText = await readClipboardText();
    if (clipboardText === null) {
      return;
    }

    await handlePasteSelection(startRowIndex, startColumnIndex, clipboardText);
  }

  async function handlePasteCurrentSelectionFromClipboard() {
    const targetSelection = selectedRangeBounds
      ? {
          rowIndex: selectedRangeBounds.startRowIndex,
          columnIndex: selectedRangeBounds.startColumnIndex,
        }
      : selectedCell;
    if (!targetSelection) {
      return;
    }

    await handlePasteSelectionFromClipboard(targetSelection.rowIndex, targetSelection.columnIndex);
  }

  function handleFormulaBarChange(nextValue: string) {
    if (!selectedCell) {
      return;
    }

    updateCellValue(selectedCell.rowIndex, selectedCell.columnIndex, nextValue);
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

  function handleOpenCreateWorkbookDialog() {
    setNewWorkbookName("NewWorkbook");
    setIsCreateWorkbookDialogOpen(true);
  }

  function handleCloseCreateWorkbookDialog() {
    setIsCreateWorkbookDialogOpen(false);
    setNewWorkbookName("NewWorkbook");
  }

  async function handleConfirmCreateWorkbook() {
    const created = await createWorkbook(newWorkbookName);
    if (created) {
      handleCloseCreateWorkbookDialog();
    }
  }

  function handleOpenFreezeDialog() {
    setFreezeDialogRowCount(appliedFreezeRowCount);
    setFreezeDialogColumnCount(appliedFreezeColumnCount);
    setIsFreezeDialogOpen(true);
  }

  useEffect(() => {
    setEditingColumnIndex(null);
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const snapshot = sheetScrollSnapshotsRef.current[activeTabId];
    if (!snapshot) {
      return;
    }

    setScrollRestoreRequest((current) => ({
      tabId: activeTabId,
      key: (current?.key ?? 0) + 1,
      scrollLeft: snapshot.scrollLeft,
      scrollTop: snapshot.scrollTop,
    }));
  }, [activeTabId, externalRefreshVersion]);

  useEffect(() => {
    if (activeTab?.workbookName) {
      setFocusedWorkbookName(activeTab.workbookName);
      return;
    }

    if (focusedWorkbookName && workbookTree.some((workbook) => workbook.name === focusedWorkbookName)) {
      return;
    }

    setFocusedWorkbookName(workbookTree[0]?.name ?? null);
  }, [activeTab, focusedWorkbookName, workbookTree]);

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

  useEffect(() => {
    if (!isRenameSheetDialogOpen) {
      return;
    }

    const input = renameSheetInputRef.current;
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [isRenameSheetDialogOpen, renameSheetTarget?.sheetName]);

  useEffect(() => {
    if (!isCodegenDialogOpen) {
      return;
    }

    const input = codegenOutputInputRef.current;
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [isCodegenDialogOpen]);

  useEffect(() => {
    if (!sheetContextMenu && !workbookContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".tree-context-menu")) {
        return;
      }

      setWorkbookContextMenu(null);
      setSheetContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkbookContextMenu(null);
        setSheetContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sheetContextMenu, workbookContextMenu]);

  function handleCloseFreezeDialog() {
    setIsFreezeDialogOpen(false);
    setFreezeDialogRowCount(appliedFreezeRowCount);
    setFreezeDialogColumnCount(appliedFreezeColumnCount);
  }

  function handleConfirmFreezeDialog() {
    setFreezeRowCount(Math.max(0, Math.min(freezeDialogRowCount, filteredRowEntries.length)));
    setFreezeColumnCount(Math.max(0, Math.min(freezeDialogColumnCount, activeSheetColumns.length)));
    setIsFreezeDialogOpen(false);
  }

  return (
    <div className="app-shell" ref={appShellRef}>
      {isCreateWorkspaceDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseCreateWorkspaceDialog}>
          <div
            aria-label="新建工作区"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">新建工作区</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">父目录</p>
              <p className="workspace-create-path-value">{createWorkspaceParentDirectoryPath}</p>

              <label className="search-field workspace-create-name-field">
                <span>工作区文件夹名称</span>
                <input
                  autoFocus
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmCreateWorkspace();
                    }
                  }}
                  placeholder="例如 GameData"
                  type="text"
                  value={newWorkspaceName}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCreateWorkspaceDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmCreateWorkspace()} type="button">
                创建并打开
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isCreateWorkbookDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseCreateWorkbookDialog}>
          <div
            aria-label="新建工作簿"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">新建工作簿</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">当前工作区</p>
              <p className="workspace-create-path-value">{workspacePath || "尚未选择工作区"}</p>

              <label className="search-field workspace-create-name-field">
                <span>工作簿名称</span>
                <input
                  autoFocus
                  onChange={(event) => setNewWorkbookName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmCreateWorkbook();
                    }
                  }}
                  placeholder="例如 Item"
                  type="text"
                  value={newWorkbookName}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCreateWorkbookDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmCreateWorkbook()} type="button">
                创建并打开
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isEditWorkbookAliasDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseEditWorkbookAliasDialog}>
          <div
            aria-label="编辑工作簿别名"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">编辑工作簿别名</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">工作簿</p>
              <p className="workspace-create-path-value">{editWorkbookAliasTarget ?? ""}</p>

              <label className="search-field workspace-create-name-field">
                <span>别名（留空可移除）</span>
                <input
                  autoFocus
                  onChange={(event) => setEditWorkbookAliasValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmEditWorkbookAlias();
                    }
                  }}
                  placeholder="例如 Items"
                  type="text"
                  value={editWorkbookAliasValue}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseEditWorkbookAliasDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmEditWorkbookAlias()} type="button">
                保存
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isCreateSheetDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseCreateSheetDialog}>
          <div
            aria-label="新建表格"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">新建表格</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">所属工作簿</p>
              <p className="workspace-create-path-value">{sheetDialogWorkbookName ?? "未选择工作簿"}</p>

              <label className="search-field workspace-create-name-field">
                <span>表格名称</span>
                <input
                  autoFocus
                  onChange={(event) => setNewSheetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmCreateSheet();
                    }
                  }}
                  placeholder="例如 Consumable"
                  type="text"
                  value={newSheetName}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCreateSheetDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmCreateSheet()} type="button">
                创建并打开
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isEditSheetAliasDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseEditSheetAliasDialog}>
          <div
            aria-label="编辑表格别名"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">编辑表格别名</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">表格</p>
              <p className="workspace-create-path-value">{editSheetAliasTarget ? `${editSheetAliasTarget.workbookName} / ${editSheetAliasTarget.sheetName}` : ""}</p>

              <label className="search-field workspace-create-name-field">
                <span>别名（留空可移除）</span>
                <input
                  autoFocus
                  onChange={(event) => setEditSheetAliasValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmEditSheetAlias();
                    }
                  }}
                  placeholder="例如 Consumables"
                  type="text"
                  value={editSheetAliasValue}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseEditSheetAliasDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmEditSheetAlias()} type="button">
                保存
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

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

      {isRenameSheetDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseRenameSheetDialog}>
          <div
            aria-label="重命名表格"
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">重命名表格</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">目标</p>
              <p className="workspace-create-path-value">
                {renameSheetTarget ? `${renameSheetTarget.workbookName} / ${renameSheetTarget.sheetName}` : "未选择表格"}
              </p>

              <label className="search-field workspace-create-name-field">
                <span>新名称</span>
                <input
                  autoFocus
                  ref={renameSheetInputRef}
                  onChange={(event) => setRenameSheetName(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmRenameSheet();
                    }
                  }}
                  placeholder="例如 Consumable"
                  type="text"
                  value={renameSheetName}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseRenameSheetDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmRenameSheet()} type="button">
                应用重命名
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isCodegenDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseCodegenDialog}>
          <div
            aria-label={codegenDialogMode === "all" ? "导出全部工作簿代码" : "导出工作簿代码"}
            aria-modal="true"
            className="workspace-create-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">{codegenDialogMode === "all" ? "导出全部工作簿代码" : "导出工作簿代码"}</p>
              </div>
            </div>

            <div className="workspace-create-body">
              <label className="search-field workspace-create-name-field">
                <span>输出相对路径</span>
                <input
                  ref={codegenOutputInputRef}
                  onChange={(event) => setCodegenOutputRelativePath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void (codegenDialogMode === "all" ? handleConfirmExportAllWorkbookCode() : handleExportWorkbookCode());
                    }
                  }}
                  placeholder="例如 Generated/Config 或 ../Shared/Generated"
                  type="text"
                  value={codegenOutputRelativePath}
                />
              </label>

              <div className="action-grid compact-grid codegen-dialog-actions">
                <button
                  className="secondary-button"
                  disabled={!canChooseWorkspaceDirectory || !workspacePath}
                  onClick={() => void handleChooseCodegenOutputDirectory()}
                  title={canChooseWorkspaceDirectory ? "选择与工作区同盘符的输出目录" : bridgeError ?? "当前环境不支持原生目录选择"}
                  type="button"
                >
                  选择文件夹
                </button>
              </div>

              <p className="workspace-create-path-label codegen-dialog-caption">
                路径相对于工作区根目录，可以使用 ../ 输出到工作区外；点击导出时会先保存工作区级配置，再执行导出。
              </p>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCodegenDialog} type="button">
                取消
              </button>
              <button className="secondary-button" onClick={() => void handleSaveWorkspaceCodegenConfig()} type="button">
                保存配置
              </button>
              <button
                className="primary-button"
                onClick={() => void (codegenDialogMode === "all" ? handleConfirmExportAllWorkbookCode() : handleExportWorkbookCode())}
                type="button"
              >
                {codegenDialogMode === "all" ? "导出全部代码" : "导出代码"}
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isFreezeDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseFreezeDialog}>
          <div
            aria-label="设置冻结行列"
            aria-modal="true"
            className="workspace-create-dialog freeze-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">设置冻结行列</p>
              </div>
            </div>

            <div className="workspace-create-body freeze-dialog-body">
              <p className="workspace-create-path-label">当前表格</p>
              <p className="workspace-create-path-value">{activeTab ? `${activeTab.workbookName} / ${activeTab.sheetName}` : "尚未打开表格"}</p>

              <div className="freeze-dialog-grid">
                <label className="search-field freeze-dialog-field">
                  <span>冻结行数</span>
                  <input
                    max={filteredRowEntries.length}
                    min={0}
                    onChange={(event) => setFreezeDialogRowCount(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleConfirmFreezeDialog();
                      }
                    }}
                    type="number"
                    value={freezeDialogRowCount}
                  />
                </label>

                <label className="search-field freeze-dialog-field">
                  <span>冻结列数</span>
                  <input
                    max={activeSheetColumns.length}
                    min={0}
                    onChange={(event) => setFreezeDialogColumnCount(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleConfirmFreezeDialog();
                      }
                    }}
                    type="number"
                    value={freezeDialogColumnCount}
                  />
                </label>
              </div>

              <p className="workspace-create-path-label codegen-dialog-caption">
                当前可见数据共有 {filteredRowEntries.length} 行、{activeSheetColumns.length} 列。输入 0 表示不冻结对应方向。
              </p>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseFreezeDialog} type="button">
                取消
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setFreezeDialogRowCount(0);
                  setFreezeDialogColumnCount(0);
                }}
                type="button"
              >
                清空
              </button>
              <button className="primary-button" onClick={handleConfirmFreezeDialog} type="button">
                应用冻结
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

      {isMcpConfigDialogOpen ? (
        <DialogBackdrop className="workspace-create-backdrop" onClose={handleCloseMcpConfigDialog}>
          <div
            aria-label="MCP 服务配置"
            aria-modal="true"
            className="workspace-create-dialog mcp-config-dialog"
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">MCP 服务配置</p>
              </div>
            </div>

            <div className="workspace-create-body mcp-config-body">
              <p className="workspace-create-path-label">当前状态</p>
              <p className="workspace-create-path-value">{mcpStatusLabel}</p>

              <p className="workspace-create-path-label">服务地址</p>
              <p className="workspace-create-path-value">{mcpConfigPreviewUrl || "请输入有效端口"}</p>

              <div className="mcp-config-settings-grid">
                <label className="search-field mcp-config-field">
                  <span>监听主机</span>
                  <input readOnly type="text" value={mcpPreferences?.serverHost ?? "127.0.0.1"} />
                </label>

                <label className="search-field mcp-config-field">
                  <span>监听端口</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => setMcpConfigPortInput(event.target.value)}
                    placeholder="39231"
                    type="text"
                    value={mcpConfigPortInput}
                  />
                </label>
              </div>

              <label className="search-field mcp-config-field">
                <span>HTTP 路径</span>
                <input
                  onChange={(event) => setMcpConfigPathInput(event.target.value)}
                  placeholder="/mcp"
                  type="text"
                  value={mcpConfigPathInput}
                />
              </label>

              <div className="action-grid compact-grid mcp-config-action-grid">
                <button className="secondary-button" onClick={() => void handleAutoFindAvailableMcpPort()} type="button">
                  自动查找可用端口
                </button>
                <button
                  className="secondary-button"
                  disabled={isSavingMcpConfiguration || isStartingMcpFromDialog}
                  onClick={() => void handleSaveMcpConfiguration()}
                  type="button"
                >
                  保存配置
                </button>
              </div>

              {mcpConfigErrorMessage || mcpPreferences?.lastStartError ? (
                <p className="column-editor-error">
                  {mcpConfigErrorMessage ?? mcpPreferences?.lastStartError}
                </p>
              ) : null}

              <p className="workspace-create-path-label">目标客户端</p>
              <div className="action-grid compact-grid mcp-config-client-grid">
                <button
                  className={`secondary-button mcp-config-client-button${mcpConfigTargetClient === "vscode" ? " is-active" : ""}`}
                  onClick={() => handleSelectMcpConfigTargetClient("vscode")}
                  type="button"
                >
                  VS Code
                </button>
              </div>

              <p className="workspace-create-path-label codegen-dialog-caption">
                当前仅支持 VS Code。配置保存后会写入用户偏好；正常关闭 Electron 时，LightyDesign 会一并关闭本地 MCP HTTP 服务。
              </p>

              {mcpConfigTargetClient ? (
                <label className="search-field mcp-config-field">
                  <span>配置 JSON</span>
                  <textarea
                    className="dialog-field-textarea column-editor-textarea mcp-config-textarea"
                    readOnly
                    ref={mcpConfigTextareaRef}
                    value={mcpConfigPreviewJson}
                  />
                </label>
              ) : null}
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseMcpConfigDialog} type="button">
                关闭
              </button>
              <button
                className="secondary-button"
                disabled={isSavingMcpConfiguration || isStartingMcpFromDialog || !hasValidMcpConfigPort}
                onClick={() => void handleStartMcpFromConfigurationDialog()}
                type="button"
              >
                {mcpPreferences?.enabled ? "按当前配置重启" : "保存并尝试启动"}
              </button>
              <button
                className="primary-button"
                disabled={!mcpConfigPreviewJson}
                onClick={() => void handleCopyMcpConfigJson()}
                type="button"
              >
                复制 JSON
              </button>
            </div>
          </div>
        </DialogBackdrop>
      ) : null}

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
              onMouseEnter={() => handleToolbarMenuHover("edit")}
              onClick={() => toggleToolbarMenu("edit")}
              type="button"
            >
              编辑
            </button>
            {openToolbarMenu === "edit" ? (
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
              onMouseEnter={() => handleToolbarMenuHover("table")}
              onClick={() => toggleToolbarMenu("table")}
              type="button"
            >
              表格
            </button>
            {openToolbarMenu === "table" ? (
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

      <WorkspaceSidebar
        focusedWorkbookName={focusedWorkbookName}
        onCreateWorkbook={handleOpenCreateWorkbookDialog}
        onFocusWorkbook={handleFocusWorkbook}
        onOpenWorkbookContextMenu={handleOpenWorkbookContextMenu}
        onRetryWorkspaceLoad={retryWorkspaceLoad}
        onWorkspaceSearchChange={setWorkspaceSearch}
        workbookTree={workbookTree}
        workspaceError={workspaceError}
        workspaceSearch={workspaceSearch}
        workspaceStatus={workspaceStatus}
      />

      <main className="workspace-main">
        <section className="editor-panel">
          <EditorWorkspaceHeader
            activeSheet={activeTab && activeSheetData ? {
              sheetName: (() => {
                const wb = workbookTree.find((w) => w.name === activeTab.workbookName);
                const sheetAlias = wb?.sheets.find((s) => s.sheetName === activeTab.sheetName)?.alias;
                return sheetAlias ?? activeSheetData.metadata.name;
              })(),
              workbookName: (() => {
                const wb = workbookTree.find((w) => w.name === activeTab.workbookName);
                return wb?.alias ?? activeTab.workbookName;
              })(),
              columnCount: activeSheetColumns.length,
              rowCount: activeSheetRows.length,
              saveStatusText,
              freezeStatusText,
              selectionStatusText,
              dirtyTabCount: activeWorkbookDirtyTabs.length,
            } : null}
            activeTabId={activeTabId}
            canCreateSheet={canCreateSheet}
            canEditActiveSheet={canEditActiveSheet}
            canRedoActiveSheet={canRedoActiveSheet}
            canSaveActiveWorkbook={canSaveActiveWorkbook}
            canUndoActiveSheet={canUndoActiveSheet}
            focusedWorkbook={focusedWorkbook}
            onAppendColumn={handleAppendColumn}
            onAppendRow={handleAppendRow}
            onCreateSheet={handleOpenCreateSheetDialog}
            onOpenFreezeDialog={handleOpenFreezeDialog}
            onOpenSheet={openSheet}
            onOpenSheetContextMenu={handleOpenSheetContextMenu}
            onRedoActiveSheetEdit={redoActiveSheetEdit}
            onSaveActiveWorkbook={() => {
              void saveActiveWorkbook();
            }}
            onSheetFilterChange={setSheetFilter}
            onUndoActiveSheetEdit={undoActiveSheetEdit}
            sheetFilter={sheetFilter}
          />

          <div className="viewer-panel">
            {!activeTab ? (
              <div className="viewer-empty-state">
                <strong>暂无已打开的表格</strong>
                <p>从左侧选择工作簿，再从上方表格选单打开表格。</p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "loading" ? (
              <div className="viewer-empty-state">
                <strong>正在加载表格</strong>
                <p>
                  {activeTab.workbookName} / {activeTab.sheetName}
                </p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "error" ? (
              <div className="viewer-empty-state is-error">
                <strong>表格加载失败</strong>
                <p>{activeSheetState.error ?? "未能读取当前表格。"}</p>
                <button className="secondary-button" onClick={retryActiveSheetLoad} type="button">
                  重试
                </button>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "ready" && activeSheetData ? (
              <>
                <div className="sheet-table-topbar">
                  <div className={`sheet-name-box${selectedCell ? "" : " is-empty"}${selectedCellCount > 1 ? " is-range" : ""}`}>{selectedCellAddress}</div>
                  <div className="sheet-formula-shell">
                    <span className="sheet-formula-prefix">fx</span>
                    <textarea
                      className="sheet-formula-input"
                      disabled={!selectedCell}
                      onChange={(event) => handleFormulaBarChange(event.target.value)}
                      placeholder="选择单元格后可直接编辑内容"
                      rows={2}
                      value={selectedCellValue}
                    />
                    <span className="sheet-formula-meta">{selectedCellDescription}</span>
                  </div>
                </div>

                <VirtualSheetTable
                  canInsertCopiedCellsDown={Boolean(copiedSelectionSnapshot)}
                  canInsertCopiedColumns={Boolean(copiedSelectionSnapshot?.canInsertColumns)}
                  canInsertCopiedRows={Boolean(copiedSelectionSnapshot?.canInsertRows)}
                  columns={activeSheetColumns}
                  columnWidths={activeColumnWidths}
                  editedCells={activeSheetState.editedCells ?? {}}
                  onEditColumn={handleOpenColumnEditor}
                  freezeColumns={appliedFreezeColumnCount}
                  freezeRows={appliedFreezeRowCount}
                  onScrollSnapshotChange={(snapshot) => {
                    if (!activeTabId) {
                      return;
                    }

                    sheetScrollSnapshotsRef.current[activeTabId] = snapshot;
                  }}
                  onAutoSizeColumn={handleAutoSizeColumn}
                  onCopySelection={handleCopySelection}
                  onCopySelectionToClipboard={() => {
                    void handleCopySelectionToClipboard();
                  }}
                  onCutSelection={() => {
                    void handleCutSelection();
                  }}
                  onClearSelection={handleClearSelectionContents}
                  onEditCell={updateCellValue}
                  onFreezeColumns={setFreezeColumnCount}
                  onFreezeRows={setFreezeRowCount}
                  onAutoFillSelection={handleAutoFillSelection}
                  onInsertColumn={handleInsertColumn}
                  onInsertCopiedCellsDown={handleInsertCopiedCellsDown}
                  onInsertCopiedColumnsAfter={(columnIndex) => handleInsertCopiedColumns(columnIndex + 1)}
                  onInsertCopiedColumnsBefore={handleInsertCopiedColumns}
                  onInsertCopiedRowsAbove={handleInsertCopiedRows}
                  onInsertCopiedRowsBelow={(rowIndex) => handleInsertCopiedRows(rowIndex + 1)}
                  onInsertColumnBefore={handleInsertColumnBefore}
                  onInsertRow={handleInsertRow}
                  onInsertRowAbove={handleInsertRowAbove}
                  onPasteSelection={handlePasteSelection}
                  onPasteSelectionFromClipboard={handlePasteSelectionFromClipboard}
                  onPasteIntoCurrentSelectionFromClipboard={handlePasteCurrentSelectionFromClipboard}
                  onResizeColumn={handleResizeColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onDeleteRow={handleDeleteRow}
                  onSelectCell={handleSelectCell}
                  onSelectColumn={handleSelectColumn}
                  onSelectAll={handleSelectAll}
                  onSelectRow={handleSelectRow}
                  rows={filteredRowEntries}
                  restoreScrollRequest={
                    scrollRestoreRequest && activeTabId === scrollRestoreRequest.tabId
                      ? scrollRestoreRequest
                      : null
                  }
                  selectedCell={selectedCell}
                  selectionRange={selectionRange}
                />

                <ColumnEditorDialog
                  column={editingColumn}
                  columnIndex={editingColumnIndex}
                  isOpen={editingColumnIndex !== null}
                  onClose={handleCloseColumnEditor}
                  onSave={handleSaveColumnDefinition}
                  onValidateType={handleValidateColumnType}
                  propertySchemas={headerPropertySchemas}
                  typeMetadata={typeMetadata}
                />
              </>
            ) : null}

          </div>
        </section>
      </main>

      {workbookContextMenu ? (
        <div
          className="tree-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={workbookContextMenuRef}
          role="menu"
          style={{ left: workbookContextMenu.x, top: workbookContextMenu.y }}
        >
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenCreateSheetDialog(workbookContextMenu.workbookName)}
            type="button"
          >
            新建表格
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenEditWorkbookAliasDialog(workbookContextMenu.workbookName)}
            type="button"
          >
            编辑别名
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => handleConvertWorkbookCode(workbookContextMenu.workbookName)}
            type="button"
          >
            导出工作簿代码
          </button>
          <button
            className="tree-context-menu-item is-danger"
            onClick={() => {
              handleCloseWorkbookContextMenu();
              void deleteWorkbook(workbookContextMenu.workbookName);
            }}
            type="button"
          >
            删除工作簿
          </button>
        </div>
      ) : null}

      {sheetContextMenu ? (
        <div
          className="tree-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={sheetContextMenuRef}
          role="menu"
          style={{ left: sheetContextMenu.x, top: sheetContextMenu.y }}
        >
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenRenameSheetDialog(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            重命名表格
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenEditSheetAliasDialog(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            编辑别名
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenCreateSheetDialog(sheetContextMenu.workbookName)}
            type="button"
          >
            新建表格
          </button>
          <button
            className="tree-context-menu-item is-danger"
            onClick={() => void handleDeleteSheet(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            删除表格
          </button>
        </div>
      ) : null}

      <footer className="status-bar">
        <div className="status-segment">
          <span className="status-label">后端</span>
          <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">选区</span>
          <strong>{selectionStatusText}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">冻结</span>
          <strong>{freezeStatusText}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">更改</span>
          <strong>{hasDirtyChanges ? "存在未保存更改" : "无未保存更改"}</strong>
        </div>
      </footer>
    </div>
  );
}

export default App;