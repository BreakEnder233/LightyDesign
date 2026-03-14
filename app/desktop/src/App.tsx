import { useEffect, useMemo, useRef, useState } from "react";

import { ColumnEditorDialog } from "./components/ColumnEditorDialog";
import { ToastCenter } from "./components/ToastCenter";
import { VirtualSheetTable } from "./components/VirtualSheetTable";
import { useDesktopHostConnection } from "./hooks/useDesktopHostConnection";
import { isShortcutModifierPressed, useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useToastCenter } from "./hooks/useToastCenter";
import { useWorkspaceEditor } from "./hooks/useWorkspaceEditor";
import { buildWorkspaceScopedStorageKey, cloneColumns, getSelectionBounds, type SheetColumn, type SheetSelection, type SheetSelectionRange, type ShortcutBinding } from "./types/desktopApp";

type CopiedSelectionSnapshot = {
  matrix: string[][];
  copiedColumns: SheetColumn[];
  canInsertRows: boolean;
  canInsertColumns: boolean;
};

const defaultColumnWidth = 140;
const minColumnWidth = 88;
const maxColumnWidth = 520;
const columnWidthSampleLimit = 200;

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

function App() {
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

  const {
    workspacePath,
    workspace,
    headerPropertySchemas,
    workspaceStatus,
    workspaceError,
    workspaceSearch,
    setWorkspaceSearch,
    openTabs,
    activeTabId,
    setActiveTabId,
    sheetFilter,
    setSheetFilter,
    workbookTree,
    totalSheetCount,
    activeTab,
    activeSheetState,
    activeSheetData,
    activeSheetColumns,
    activeSheetRows,
    activeWorkbookSaveState,
    activeWorkbookDirtyTabs,
    filteredRowEntries,
    openSheet,
    closeTab,
    chooseParentDirectoryForWorkspaceCreation,
    createWorkspace,
    createWorkbook,
    deleteWorkbook,
    createSheet,
    deleteSheet,
    renameSheet,
    saveWorkbookCodegenOptions,
    exportWorkbookCode,
    chooseWorkspaceDirectory,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    applyCellEdits,
    insertRow,
    deleteRow,
    insertColumn,
    deleteColumn,
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
  const hostUrlLabel = bridgeStatus === "unavailable" ? "Electron bridge 未就绪" : hostInfo?.desktopHostUrl ?? "加载中...";
  const runtimeLabel = bridgeStatus === "unavailable" ? "不可用" : hostInfo?.shell ?? "加载中...";
  const [isCreateWorkspaceDialogOpen, setIsCreateWorkspaceDialogOpen] = useState(false);
  const [createWorkspaceParentDirectoryPath, setCreateWorkspaceParentDirectoryPath] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("NewWorkspace");
  const [isCreateWorkbookDialogOpen, setIsCreateWorkbookDialogOpen] = useState(false);
  const [isCreateSheetDialogOpen, setIsCreateSheetDialogOpen] = useState(false);
  const [isRenameSheetDialogOpen, setIsRenameSheetDialogOpen] = useState(false);
  const [isCodegenDialogOpen, setIsCodegenDialogOpen] = useState(false);
  const [isFreezeDialogOpen, setIsFreezeDialogOpen] = useState(false);
  const [newWorkbookName, setNewWorkbookName] = useState("NewWorkbook");
  const [newSheetName, setNewSheetName] = useState("NewSheet");
  const [renameSheetName, setRenameSheetName] = useState("");
  const [codegenOutputRelativePath, setCodegenOutputRelativePath] = useState("");
  const [sheetDialogWorkbookName, setSheetDialogWorkbookName] = useState<string | null>(null);
  const [renameSheetTarget, setRenameSheetTarget] = useState<{ workbookName: string; sheetName: string } | null>(null);
  const [codegenWorkbookName, setCodegenWorkbookName] = useState<string | null>(null);
  const renameSheetInputRef = useRef<HTMLInputElement | null>(null);
  const codegenOutputInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<SheetSelection | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<SheetSelection | null>(null);
  const [freezeRowCount, setFreezeRowCount] = useState(0);
  const [freezeColumnCount, setFreezeColumnCount] = useState(0);
  const [columnWidthsBySheet, setColumnWidthsBySheet] = useState<Record<string, number[]>>({});
  const [freezeDialogRowCount, setFreezeDialogRowCount] = useState(0);
  const [freezeDialogColumnCount, setFreezeDialogColumnCount] = useState(0);
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [sheetContextMenu, setSheetContextMenu] = useState<{
    workbookName: string;
    sheetName: string;
    x: number;
    y: number;
  } | null>(null);
  const [copiedSelectionSnapshot, setCopiedSelectionSnapshot] = useState<CopiedSelectionSnapshot | null>(null);

  const editingColumn = editingColumnIndex !== null ? (activeSheetColumns[editingColumnIndex] ?? null) : null;

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

  function handleDeleteRow(rowIndex: number) {
    deleteRow(rowIndex);
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
    deleteColumn(columnIndex);
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
    setSheetDialogWorkbookName(workbookName);
    setNewSheetName("NewSheet");
    setIsCreateSheetDialogOpen(true);
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

  function handleOpenRenameSheetDialog(workbookName: string, sheetName: string) {
    setRenameSheetTarget({ workbookName, sheetName });
    setRenameSheetName(sheetName);
    setIsRenameSheetDialogOpen(true);
    setSheetContextMenu(null);
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
  }

  function handleCloseSheetContextMenu() {
    setSheetContextMenu(null);
  }

  function handleConvertWorkbookCode(workbookName: string) {
    const targetWorkbook = workspace?.workbooks.find((workbook) => workbook.name === workbookName) ?? null;
    setCodegenWorkbookName(workbookName);
    setCodegenOutputRelativePath(targetWorkbook?.codegen.outputRelativePath ?? "");
    setIsCodegenDialogOpen(true);
  }

  function handleCloseCodegenDialog() {
    setIsCodegenDialogOpen(false);
    setCodegenWorkbookName(null);
    setCodegenOutputRelativePath("");
  }

  async function handleSaveWorkbookCodegenConfig() {
    if (!codegenWorkbookName) {
      return;
    }

    const saved = await saveWorkbookCodegenOptions(codegenWorkbookName, codegenOutputRelativePath);
    if (saved) {
      handleCloseCodegenDialog();
    }
  }

  async function handleExportWorkbookCode() {
    if (!codegenWorkbookName) {
      return;
    }

    const saved = await saveWorkbookCodegenOptions(codegenWorkbookName, codegenOutputRelativePath);
    if (!saved) {
      return;
    }

    const exported = await exportWorkbookCode(codegenWorkbookName);
    if (exported) {
      handleCloseCodegenDialog();
    }
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
      const payload = await response.json() as { error?: string; normalizedType?: string };

      if (!response.ok) {
        return {
          ok: false,
          message: payload.error ?? `Type 校验失败: ${response.status}`,
        };
      }

      return {
        ok: true,
        normalizedType: payload.normalizedType,
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

  const sheetStatusText = activeTab && activeSheetData
    ? `${activeTab.workbookName} / ${activeTab.sheetName} · ${filteredRowEntries.length}/${activeSheetRows.length} 行 · ${activeSheetColumns.length} 列`
    : "未打开 Sheet";

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
  const selectedValueLength = selectedCellValue.length;

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
      filteredRowEntries.length === activeSheetRows.length &&
      selectedRangeBounds.startRowIndex === 0 &&
      selectedRangeBounds.endRowIndex === activeSheetRows.length - 1;

    setCopiedSelectionSnapshot({
      matrix,
      copiedColumns: cloneColumns(activeSheetColumns.slice(selectedRangeBounds.startColumnIndex, selectedRangeBounds.endColumnIndex + 1)),
      canInsertRows: isFullRowSelection,
      canInsertColumns: isFullColumnSelection,
    });

    return matrix.map((row) => row.join("\t")).join("\n");
  }

  function handlePasteSelection(startRowIndex: number, startColumnIndex: number, clipboardText: string) {
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

    dismissToast(toastId);
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
    if (!sheetContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".tree-context-menu")) {
        return;
      }

      setSheetContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheetContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sheetContextMenu]);

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
    <div className="app-shell">
      {isCreateWorkspaceDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseCreateWorkspaceDialog} role="presentation">
          <div
            aria-labelledby="workspace-create-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2 id="workspace-create-title">新建工作区</h2>
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
        </div>
      ) : null}

      {isCreateWorkbookDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseCreateWorkbookDialog} role="presentation">
          <div
            aria-labelledby="workbook-create-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Workbook</p>
                <h2 id="workbook-create-title">新建工作簿</h2>
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
        </div>
      ) : null}

      {isCreateSheetDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseCreateSheetDialog} role="presentation">
          <div
            aria-labelledby="sheet-create-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Sheet</p>
                <h2 id="sheet-create-title">新建 Sheet</h2>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">所属工作簿</p>
              <p className="workspace-create-path-value">{sheetDialogWorkbookName ?? "未选择工作簿"}</p>

              <label className="search-field workspace-create-name-field">
                <span>Sheet 名称</span>
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
        </div>
      ) : null}

      {isRenameSheetDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseRenameSheetDialog} role="presentation">
          <div
            aria-labelledby="sheet-rename-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Sheet</p>
                <h2 id="sheet-rename-title">重命名 Sheet</h2>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">目标</p>
              <p className="workspace-create-path-value">
                {renameSheetTarget ? `${renameSheetTarget.workbookName} / ${renameSheetTarget.sheetName}` : "未选择 Sheet"}
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
        </div>
      ) : null}

      {isCodegenDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseCodegenDialog} role="presentation">
          <div
            aria-labelledby="codegen-dialog-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Codegen</p>
                <h2 id="codegen-dialog-title">导出 C# 代码</h2>
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
                      void handleExportWorkbookCode();
                    }
                  }}
                  placeholder="例如 Generated/Config"
                  type="text"
                  value={codegenOutputRelativePath}
                />
              </label>

              <div className="action-grid compact-grid codegen-dialog-actions">
                <button
                  className="secondary-button"
                  disabled={!canChooseWorkspaceDirectory || !workspacePath}
                  onClick={() => void handleChooseCodegenOutputDirectory()}
                  title={canChooseWorkspaceDirectory ? "选择工作区中的输出目录" : bridgeError ?? "当前环境不支持原生目录选择"}
                  type="button"
                >
                  选择文件夹
                </button>
              </div>

              <p className="workspace-create-path-label codegen-dialog-caption">
                路径相对于工作区根目录；点击“导出代码”时会先保存配置，再执行导出。
              </p>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCodegenDialog} type="button">
                取消
              </button>
              <button className="secondary-button" onClick={() => void handleSaveWorkbookCodegenConfig()} type="button">
                保存配置
              </button>
              <button className="primary-button" onClick={() => void handleExportWorkbookCode()} type="button">
                导出代码
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFreezeDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseFreezeDialog} role="presentation">
          <div
            aria-labelledby="freeze-dialog-title"
            aria-modal="true"
            className="workspace-create-dialog freeze-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Freeze</p>
                <h2 id="freeze-dialog-title">设置冻结行列</h2>
              </div>
            </div>

            <div className="workspace-create-body freeze-dialog-body">
              <p className="workspace-create-path-label">当前 Sheet</p>
              <p className="workspace-create-path-value">{activeTab ? `${activeTab.workbookName} / ${activeTab.sheetName}` : "尚未打开 Sheet"}</p>

              <div className="freeze-dialog-grid">
                <label className="search-field freeze-dialog-field">
                  <span>冻结行</span>
                  <input
                    autoFocus
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
                  <span>冻结列</span>
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

              <p className="freeze-dialog-caption">最多可冻结 {filteredRowEntries.length} 行、{activeSheetColumns.length} 列。</p>
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
        </div>
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

      <aside className="workspace-sidebar">
        <div className="brand-block">
          <p className="eyebrow">Explorer</p>
          <h1>LightyDesign</h1>
          <p className="sidebar-copy">桌面工作台。左侧管理工作区与工作簿，右侧专注表格编辑。</p>
        </div>

        <section className="sidebar-section workspace-entry-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>当前工作区</h2>
            </div>
            {workspaceStatus === "loading" ? <span className="badge">加载中</span> : null}
          </div>

          <div className="action-grid">
            <button
              className="secondary-button"
              disabled={!canChooseWorkspaceDirectory}
              onClick={() => void handleOpenCreateWorkspaceDialog()}
              title={canChooseWorkspaceDirectory ? "选择父目录并新建工作区" : bridgeError ?? "当前环境不支持原生目录选择"}
              type="button"
            >
              新建工作区
            </button>
            <button
              className="primary-button"
              disabled={!canChooseWorkspaceDirectory}
              onClick={chooseWorkspaceDirectory}
              title={canChooseWorkspaceDirectory ? "选择一个工作区目录" : bridgeError ?? "当前环境不支持原生目录选择"}
              type="button"
            >
              选择目录
            </button>
          </div>

          <p className="path-label">工作区路径</p>
          <p className="workspace-path">{workspacePath || "尚未选择工作区目录"}</p>

          <div className="workspace-stats">
            <div>
              <span>工作簿</span>
              <strong>{workbookTree.length}</strong>
            </div>
            <div>
              <span>Sheets</span>
              <strong>{totalSheetCount}</strong>
            </div>
            <div>
              <span>Header</span>
              <strong>{workspace?.headerLayout.count ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="sidebar-section tree-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Navigator</p>
              <h2>工作簿树</h2>
            </div>
          </div>

          <div className="action-grid compact-grid">
            <button
              className="secondary-button"
              disabled={workspaceStatus !== "ready"}
              onClick={handleOpenCreateWorkbookDialog}
              type="button"
            >
              新建工作簿
            </button>
            <button
              className="secondary-button"
              disabled={workspaceStatus === "idle" || workspaceStatus === "loading"}
              onClick={retryWorkspaceLoad}
              type="button"
            >
              刷新工作区
            </button>
          </div>

          <label className="search-field compact-field">
            <span>搜索工作簿或 Sheet</span>
            <input
              onChange={(event) => setWorkspaceSearch(event.target.value)}
              placeholder="例如 Item / Consumable"
              type="text"
              value={workspaceSearch}
            />
          </label>

          {workspaceStatus === "idle" ? (
            <div className="empty-panel">
              <strong>等待工作区</strong>
              <p>先选择一个包含 headers.json 和工作簿目录的工作区。</p>
            </div>
          ) : null}

          {workspaceStatus === "error" ? (
            <div className="empty-panel is-error">
              <strong>工作区加载失败</strong>
              <p>{workspaceError ?? "未能读取当前工作区。"}</p>
              <button className="secondary-button" onClick={retryWorkspaceLoad} type="button">
                重试
              </button>
            </div>
          ) : null}

          {workspaceStatus === "ready" && workbookTree.length === 0 ? (
            <div className="empty-panel">
              <strong>工作区为空</strong>
              <p>{workspaceSearch ? "当前搜索条件没有匹配结果。" : "已读取 headers.json，但暂未发现任何工作簿或 Sheet。"}</p>
            </div>
          ) : null}

          {workspaceStatus === "ready" && workbookTree.length > 0 ? (
            <div className="tree-list">
              {workbookTree.map((workbook) => (
                <div className="tree-workbook" key={workbook.name}>
                  <div className="tree-workbook-header">
                    <div className="tree-workbook-title">
                      <strong>{workbook.name}</strong>
                      <span>{workbook.sheets.length} 个 Sheet</span>
                    </div>
                    <div className="tree-workbook-actions">
                      <button
                        className="secondary-button tree-workbook-action"
                        onClick={() => handleOpenCreateSheetDialog(workbook.name)}
                        type="button"
                      >
                        添加 Sheet
                      </button>
                      <button
                        className="secondary-button tree-workbook-action"
                        onClick={() => handleConvertWorkbookCode(workbook.name)}
                        type="button"
                      >
                        转换代码
                      </button>
                      <button
                        aria-label={`删除工作簿 ${workbook.name}`}
                        className="tree-workbook-delete"
                        onClick={() => void deleteWorkbook(workbook.name)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="tree-sheet-grid">
                    {workbook.sheets.map((sheet) => {
                      const tabId = `${sheet.workbookName}::${sheet.sheetName}`;
                      const isActive = activeTabId === tabId;

                      return (
                        <button
                          className={`tree-sheet-button${isActive ? " is-active" : ""}`}
                          key={tabId}
                          onClick={() => openSheet(sheet.workbookName, sheet.sheetName)}
                          onContextMenu={(event) => handleOpenSheetContextMenu(event, sheet.workbookName, sheet.sheetName)}
                          type="button"
                        >
                          <span className="tree-sheet-name">{sheet.sheetName}</span>
                          <em>{sheet.columnCount} × {sheet.rowCount}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </aside>

      <main className="workspace-main">
        <section className="editor-panel">
          <div className="tab-strip">
            {openTabs.length === 0 ? (
              <div className="tab-strip-empty">打开左侧任意 Sheet 开始编辑。</div>
            ) : (
              openTabs.map((tab) => (
                <div className={`sheet-tab${tab.id === activeTabId ? " is-active" : ""}`} key={tab.id}>
                  <button className="sheet-tab-trigger" onClick={() => setActiveTabId(tab.id)} type="button">
                    <span>{tab.sheetName}</span>
                    <em>{tab.workbookName}</em>
                  </button>
                  <button className="sheet-tab-close" onClick={() => closeTab(tab.id)} type="button">
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="viewer-panel">
            {!activeTab ? (
              <div className="viewer-empty-state">
                <strong>暂无已打开的 Sheet</strong>
                <p>从左侧工作簿树中选择一个 Sheet，主区域会按需加载真实数据。</p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "loading" ? (
              <div className="viewer-empty-state">
                <strong>正在加载 Sheet</strong>
                <p>
                  {activeTab.workbookName} / {activeTab.sheetName}
                </p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "error" ? (
              <div className="viewer-empty-state is-error">
                <strong>Sheet 加载失败</strong>
                <p>{activeSheetState.error ?? "未能读取当前 Sheet。"}</p>
                <button className="secondary-button" onClick={retryActiveSheetLoad} type="button">
                  重试
                </button>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "ready" && activeSheetData ? (
              <>
                <div className="viewer-header">
                  <div>
                    <p className="eyebrow">Sheet</p>
                    <h3>{activeSheetData.metadata.name}</h3>
                  </div>
                  <div className="viewer-metadata">
                    <span>{activeTab.workbookName}</span>
                    <span>{activeSheetColumns.length} 列</span>
                    <span>{activeSheetRows.length} 行</span>
                    <span>{activeWorkbookDirtyTabs.length} dirty</span>
                  </div>
                </div>

                <div className="viewer-toolbar">
                  <label className="search-field sheet-filter-field compact-field">
                    <span>筛选当前 Sheet</span>
                    <input
                      onChange={(event) => setSheetFilter(event.target.value)}
                      placeholder="按任意单元格文本过滤"
                      type="text"
                      value={sheetFilter}
                    />
                  </label>

                  <div className="toolbar-side">
                    <div className="toolbar-button-group">
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.undoStack?.length}
                        onClick={undoActiveSheetEdit}
                        title="撤销当前 Sheet 编辑 (Ctrl+Z)"
                        type="button"
                      >
                        撤销
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.redoStack?.length}
                        onClick={redoActiveSheetEdit}
                        title="恢复当前 Sheet 编辑 (Ctrl+Y / Ctrl+Shift+Z)"
                        type="button"
                      >
                        恢复
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.dirty}
                        onClick={restoreActiveSheetDraft}
                        type="button"
                      >
                        还原
                      </button>
                      <button
                        className="primary-button"
                        disabled={activeWorkbookDirtyTabs.length === 0 || activeWorkbookSaveState?.status === "saving"}
                        onClick={() => void saveActiveWorkbook()}
                        title="保存当前工作簿 (Ctrl+S)"
                        type="button"
                      >
                        保存
                      </button>
                    </div>

                    <div className="toolbar-button-group">
                      <button
                        className="secondary-button"
                        onClick={handleAppendRow}
                        title="在当前 Sheet 末尾添加一行"
                        type="button"
                      >
                        在末尾添加行
                      </button>
                      <button
                        className="secondary-button"
                        onClick={handleAppendColumn}
                        title="在当前 Sheet 末尾添加一列"
                        type="button"
                      >
                        在末尾添加列
                      </button>
                    </div>

                    <div className="freeze-toolbar">
                      <span className="freeze-summary">{freezeStatusText}</span>
                      <button className="secondary-button" onClick={handleOpenFreezeDialog} type="button">
                        设置冻结
                      </button>
                      <button
                        className="secondary-button"
                        disabled={appliedFreezeRowCount === 0 && appliedFreezeColumnCount === 0}
                        onClick={() => {
                          setFreezeRowCount(0);
                          setFreezeColumnCount(0);
                        }}
                        type="button"
                      >
                        取消冻结
                      </button>
                    </div>
                  </div>
                </div>

                <div className="sheet-table-topbar">
                  <div className={`sheet-name-box${selectedCell ? "" : " is-empty"}${selectedCellCount > 1 ? " is-range" : ""}`}>{selectedCellAddress}</div>
                  <div className="sheet-formula-shell">
                    <span className="sheet-formula-prefix">fx</span>
                    <input
                      className="sheet-formula-input"
                      disabled={!selectedCell}
                      onChange={(event) => handleFormulaBarChange(event.target.value)}
                      placeholder="选择单元格后可直接编辑内容"
                      type="text"
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
                  onResizeColumn={handleResizeColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onDeleteRow={handleDeleteRow}
                  onSelectCell={handleSelectCell}
                  onSelectColumn={handleSelectColumn}
                  onSelectAll={handleSelectAll}
                  onSelectRow={handleSelectRow}
                  rows={filteredRowEntries}
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
                />
              </>
            ) : null}
          </div>
        </section>
      </main>

      {sheetContextMenu ? (
        <div
          className="tree-context-menu"
          onClick={(event) => event.stopPropagation()}
          role="menu"
          style={{ left: sheetContextMenu.x, top: sheetContextMenu.y }}
        >
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenRenameSheetDialog(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            重命名 Sheet
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => handleOpenCreateSheetDialog(sheetContextMenu.workbookName)}
            type="button"
          >
            添加 Sheet
          </button>
          <button
            className="tree-context-menu-item is-danger"
            onClick={() => void handleDeleteSheet(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            删除 Sheet
          </button>
        </div>
      ) : null}

      <footer className="status-bar">
        <div className="status-segment">
          <span className="status-label">Backend</span>
          <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
          <span className="status-detail">{runtimeLabel}</span>
        </div>
        <div className="status-segment is-wide">
          <span className="status-label">Workspace</span>
          <strong>{workspacePath || "未选择工作区"}</strong>
        </div>
        <div className="status-segment is-wide">
          <span className="status-label">Sheet</span>
          <strong>{sheetStatusText}</strong>
        </div>
        <div className="status-segment">
          <span className="status-label">Selection</span>
          <strong>{selectionStatusText}</strong>
          <span className="status-detail">{selectedValueLength} chars</span>
        </div>
        <div className="status-segment">
          <span className="status-label">Freeze</span>
          <strong>{freezeStatusText}</strong>
          <span className="status-detail">滚动区继续支持筛选与编辑</span>
        </div>
        <div className="status-segment">
          <span className="status-label">Save</span>
          <strong>{saveStatusText}</strong>
          <span className="status-detail">{hostUrlLabel}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;