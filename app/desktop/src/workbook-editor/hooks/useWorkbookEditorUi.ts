import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

import { isShortcutModifierPressed, useEditorShortcuts } from "../../hooks/useEditorShortcuts";
import { buildAutoFillSeriesGenerator } from "../../utils/autoFill";
import {
  buildRepeatedFillValue,
  clampContextMenuPosition,
  cloneSheetColumnSnapshot,
  formatSelectionAddress,
  measureTextWidth,
  parseClipboardMatrix,
  tryGetWorkspaceRelativePath,
} from "../../utils/appHelpers";
import {
  buildWorkspaceScopedStorageKey,
  cloneColumns,
  getSelectionBounds,
  type SheetColumn,
  type SheetSelection,
  type SheetSelectionRange,
  type ShortcutBinding,
  type ToastNotification,
} from "../types/desktopApp";

import type { useWorkspaceEditor } from "./useWorkspaceEditor";

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

type CodegenDialogMode = "single" | "all";

type PushToastInput = Omit<ToastNotification, "id" | "summary" | "timestamp"> & {
  summary?: string;
};

type UseWorkbookEditorUiArgs = {
  appShellRef: RefObject<HTMLDivElement | null>;
  bridgeError: string | null;
  hostInfo: DesktopHostInfo | null;
  onToast: (toast: PushToastInput) => void;
  shortcutScopeActive?: boolean;
  workspaceEditor: ReturnType<typeof useWorkspaceEditor>;
};

const defaultColumnWidth = 140;
const minColumnWidth = 88;
const maxColumnWidth = 520;
const columnWidthSampleLimit = 200;
const selectionContextRowPreviewLimit = 50;
const selectionContextColumnPreviewLimit = 20;

export function useWorkbookEditorUi({
  appShellRef,
  bridgeError,
  hostInfo,
  onToast,
  shortcutScopeActive = true,
  workspaceEditor,
}: UseWorkbookEditorUiArgs) {
  const {
    workspacePath,
    workspace,
    workspaceStatus,
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
    closeAllTabs,
    createWorkbook,
    deleteWorkbook,
    createSheet,
    deleteSheet,
    renameSheet,
    saveWorkspaceCodegenOptions,
    exportWorkbookCode,
    exportAllWorkbookCode,
    closeWorkspace,
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
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
    setWorkbookAlias,
    setSheetAlias,
  } = workspaceEditor;

  const workbookContextMenuRef = useRef<HTMLDivElement | null>(null);
  const sheetContextMenuRef = useRef<HTMLDivElement | null>(null);
  const renameSheetInputRef = useRef<HTMLInputElement | null>(null);
  const codegenOutputInputRef = useRef<HTMLInputElement | null>(null);
  const sheetScrollSnapshotsRef = useRef<Record<string, SheetScrollSnapshot>>({});

  const [isCreateWorkbookDialogOpen, setIsCreateWorkbookDialogOpen] = useState(false);
  const [isEditWorkbookAliasDialogOpen, setIsEditWorkbookAliasDialogOpen] = useState(false);
  const [editWorkbookAliasTarget, setEditWorkbookAliasTarget] = useState<string | null>(null);
  const [editWorkbookAliasValue, setEditWorkbookAliasValue] = useState("");
  const [isCreateSheetDialogOpen, setIsCreateSheetDialogOpen] = useState(false);
  const [isRenameSheetDialogOpen, setIsRenameSheetDialogOpen] = useState(false);
  const [isEditSheetAliasDialogOpen, setIsEditSheetAliasDialogOpen] = useState(false);
  const [editSheetAliasTarget, setEditSheetAliasTarget] = useState<{ workbookName: string; sheetName: string } | null>(null);
  const [editSheetAliasValue, setEditSheetAliasValue] = useState("");
  const [isCodegenDialogOpen, setIsCodegenDialogOpen] = useState(false);
  const [isFreezeDialogOpen, setIsFreezeDialogOpen] = useState(false);
  const [newWorkbookName, setNewWorkbookName] = useState("NewWorkbook");
  const [newSheetName, setNewSheetName] = useState("NewSheet");
  const [renameSheetName, setRenameSheetName] = useState("");
  const [codegenOutputRelativePath, setCodegenOutputRelativePath] = useState("");
  const [sheetDialogWorkbookName, setSheetDialogWorkbookName] = useState<string | null>(null);
  const [renameSheetTarget, setRenameSheetTarget] = useState<{ workbookName: string; sheetName: string } | null>(null);
  const [codegenWorkbookName, setCodegenWorkbookName] = useState<string | null>(null);
  const [codegenDialogMode, setCodegenDialogMode] = useState<CodegenDialogMode>("single");
  const [selectedCell, setSelectedCell] = useState<SheetSelection | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<SheetSelection | null>(null);
  const [freezeRowCount, setFreezeRowCount] = useState(0);
  const [freezeColumnCount, setFreezeColumnCount] = useState(0);
  const [columnWidthsBySheet, setColumnWidthsBySheet] = useState<Record<string, number[]>>({});
  const [freezeDialogRowCount, setFreezeDialogRowCount] = useState(0);
  const [freezeDialogColumnCount, setFreezeDialogColumnCount] = useState(0);
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [editingColumnSnapshot, setEditingColumnSnapshot] = useState<SheetColumn | null>(null);
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
  const [scrollRestoreRequest, setScrollRestoreRequest] = useState<{
    tabId: string;
    key: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const editingColumn = editingColumnSnapshot;
  const focusedWorkbook = useMemo(
    () => workbookTree.find((workbook) => workbook.name === focusedWorkbookName) ?? null,
    [focusedWorkbookName, workbookTree],
  );
  const canCreateSheet = workspaceStatus === "ready" && Boolean(focusedWorkbookName);
  const canUndoActiveSheet = Boolean(activeSheetState?.undoStack?.length);
  const canRedoActiveSheet = Boolean(activeSheetState?.redoStack?.length);
  const canSaveActiveWorkbook = Boolean(
    activeTab && hostInfo && workspacePath && activeWorkbookDirtyTabs.length > 0 && activeWorkbookSaveState?.status !== "saving",
  );
  const workspaceCodegenOutputRelativePath = workspace?.codegen.outputRelativePath ?? "";

  function pushToastNotification(toast: PushToastInput) {
    onToast(toast);
  }

  function getContextMenuContainerRect() {
    return appShellRef.current?.getBoundingClientRect() ?? null;
  }

  function applySelectionRange(anchor: SheetSelection, focus: SheetSelection) {
    setSelectionAnchor(anchor);
    setSelectedCell(focus);
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
    setEditingColumnSnapshot(cloneSheetColumnSnapshot(activeSheetColumns[columnIndex]));
  }

  function handleCloseColumnEditor() {
    setEditingColumnIndex(null);
    setEditingColumnSnapshot(null);
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

  function handleOpenWorkbookContextMenu(event: MouseEvent<HTMLButtonElement>, workbookName: string) {
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
    const workbook = workbookTree.find((entry) => entry.name === workbookName) ?? null;
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
    const workbook = workbookTree.find((entry) => entry.name === workbookName) ?? null;
    const sheet = workbook?.sheets.find((entry) => entry.sheetName === sheetName) ?? null;
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

  function handleOpenSheetContextMenu(event: MouseEvent<HTMLButtonElement>, workbookName: string, sheetName: string) {
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
        descriptor?: import("../types/desktopApp").TypeDescriptorResponse;
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

  async function handleResolveValidationSchema(type: string) {
    if (!hostInfo || !workspacePath) {
      return {
        ok: false,
        message: "工作区未连接，无法获取 validation schema。",
      };
    }

    const query = new URLSearchParams({
      type,
      workspacePath,
    });

    try {
      const response = await fetch(`${hostInfo.desktopHostUrl}/api/workspace/validation-schema?${query.toString()}`);
      const payload = await response.json() as {
        error?: string;
        descriptor?: import("../types/desktopApp").TypeDescriptorResponse;
        schema?: import("../types/desktopApp").ValidationRuleSchema;
      };

      if (!response.ok) {
        return {
          ok: false,
          message: payload.error ?? `validation schema 获取失败: ${response.status}`,
        };
      }

      return {
        ok: true,
        descriptor: payload.descriptor,
        schema: payload.schema,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "validation schema 获取失败。",
      };
    }
  }

  async function handleValidateColumnValidationRule(type: string, validation: unknown) {
    if (!hostInfo || !workspacePath) {
      return {
        ok: false,
        message: "工作区未连接，无法校验 validation 规则。",
      };
    }

    try {
      const response = await fetch(`${hostInfo.desktopHostUrl}/api/workspace/validation-rules/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspacePath,
          type,
          validation,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok) {
        return {
          ok: false,
          message: payload.error ?? `validation 规则校验失败: ${response.status}`,
        };
      }

      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "validation 规则校验失败。",
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
        enabled: shortcutScopeActive && canSaveActiveWorkbook,
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
        enabled: shortcutScopeActive && canUndoActiveSheet,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "z",
        run: undoActiveSheetEdit,
      },
      {
        id: "redo-sheet-edit",
        label: "恢复当前 Sheet 编辑",
        hint: "Ctrl+Y / Ctrl+Shift+Z",
        enabled: shortcutScopeActive && canRedoActiveSheet,
        matches: (event) =>
          isShortcutModifierPressed(event) &&
          ((event.key.toLowerCase() === "y" && !event.shiftKey) || (event.key.toLowerCase() === "z" && event.shiftKey)),
        run: redoActiveSheetEdit,
      },
      {
        id: "select-all-cells",
        label: "选择当前 Sheet 可见区域",
        hint: "Ctrl+A",
        enabled: shortcutScopeActive && Boolean(activeSheetData && filteredRowEntries.length > 0),
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "a",
        run: handleSelectAll,
      },
      {
        id: "copy-selected-cells",
        label: "复制选区",
        hint: "Ctrl+C",
        enabled: shortcutScopeActive && Boolean(selectedCell),
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
        enabled: shortcutScopeActive && Boolean(selectedCell),
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "x",
        run: () => {
          void handleCutSelection();
        },
      },
      {
        id: "clear-selected-cells",
        label: "清空选区",
        hint: "Delete",
        enabled: shortcutScopeActive && Boolean(selectedCell),
        matches: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Delete",
        run: handleClearSelectionContents,
      },
    ],
    [activeSheetData, canRedoActiveSheet, canSaveActiveWorkbook, canUndoActiveSheet, filteredRowEntries.length, redoActiveSheetEdit, saveActiveWorkbook, selectedCell, shortcutScopeActive, undoActiveSheetEdit],
  );

  useEditorShortcuts(shortcutBindings);

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

    const canInsertRows =
      selectedRangeBounds.startColumnIndex === 0 &&
      selectedRangeBounds.endColumnIndex === activeSheetColumns.length - 1;
    const canInsertColumns =
      filteredRowEntries.length > 0 &&
      selectedRangeRowEntries.length === filteredRowEntries.length &&
      selectedRangeBounds.startRowIndex === filteredRowEntries[0].rowIndex &&
      selectedRangeBounds.endRowIndex === filteredRowEntries[filteredRowEntries.length - 1].rowIndex;

    setCopiedSelectionSnapshot({
      matrix,
      copiedColumns: cloneColumns(activeSheetColumns.slice(selectedRangeBounds.startColumnIndex, selectedRangeBounds.endColumnIndex + 1)),
      canInsertRows,
      canInsertColumns,
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
      return;
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

  useEffect(() => {
    setEditingColumnIndex(null);
    setEditingColumnSnapshot(null);
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

  return {
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
    handleClearSelectionContents,
    handleCloseColumnEditor,
    handleCloseCodegenDialog,
    handleCloseCreateSheetDialog,
    handleCloseCreateWorkbookDialog,
    handleCloseEditSheetAliasDialog,
    handleCloseEditWorkbookAliasDialog,
    handleCloseFreezeDialog,
    handleCloseRenameSheetDialog,
    handleCloseSheetContextMenu,
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
    handleOpenCodegenDialog: handleConvertWorkbookCode,
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
    handleChooseCodegenOutputDirectory,
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
  };
}