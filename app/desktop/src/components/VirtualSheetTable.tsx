import { useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  buildCellKey,
  getColumnEditorKind,
  getColumnExportScope,
  getSelectionBounds,
  type SheetColumn,
  type SheetSelection,
  type SheetSelectionRange,
} from "../types/desktopApp";

type VirtualSheetTableProps = {
  restoreScrollRequest?: {
    key: number;
    scrollLeft: number;
    scrollTop: number;
  } | null;
  canInsertCopiedCellsDown: boolean;
  canInsertCopiedColumns: boolean;
  canInsertCopiedRows: boolean;
  columns: SheetColumn[];
  columnWidths: number[];
  rows: Array<{
    row: string[];
    rowIndex: number;
  }>;
  editedCells: Record<string, string>;
  selectedCell: SheetSelection | null;
  selectionRange: SheetSelectionRange | null;
  freezeRows: number;
  freezeColumns: number;
  onSelectCell: (rowIndex: number, columnIndex: number, options?: { extendSelection?: boolean }) => void;
  onSelectRow: (rowIndex: number, options?: { extendSelection?: boolean }) => void;
  onSelectColumn: (columnIndex: number, options?: { extendSelection?: boolean }) => void;
  onSelectAll: () => void;
  onEditColumn: (columnIndex: number) => void;
  onResizeColumn: (columnIndex: number, nextWidth: number) => void;
  onAutoSizeColumn: (columnIndex: number) => void;
  onFreezeRows: (rowCount: number) => void;
  onFreezeColumns: (columnCount: number) => void;
  onInsertRowAbove: (rowIndex: number) => void;
  onInsertRow: (afterRowIndex: number) => void;
  onInsertCopiedRowsAbove: (rowIndex: number) => void;
  onInsertCopiedRowsBelow: (rowIndex: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onInsertColumnBefore: (columnIndex: number) => void;
  onInsertColumn: (afterColumnIndex: number) => void;
  onInsertCopiedColumnsBefore: (columnIndex: number) => void;
  onInsertCopiedColumnsAfter: (columnIndex: number) => void;
  onDeleteColumn: (columnIndex: number) => void;
  onInsertCopiedCellsDown: (rowIndex: number, columnIndex: number) => void;
  onAutoFillSelection: (targetRowIndex: number, targetColumnIndex: number) => void;
  onCopySelection: () => string;
  onCopySelectionToClipboard: () => void;
  onCutSelection: () => void;
  onClearSelection: () => void;
  onPasteSelection: (rowIndex: number, columnIndex: number, clipboardText: string) => void;
  onPasteSelectionFromClipboard: (rowIndex: number, columnIndex: number) => void;
  onPasteIntoCurrentSelectionFromClipboard: () => void;
  onEditCell: (rowIndex: number, columnIndex: number, nextValue: string) => void;
  onScrollSnapshotChange?: (snapshot: { scrollLeft: number; scrollTop: number }) => void;
};

const rowHeight = 30;
const overscanCount = 12;
const rowNumberWidth = 56;
const contextMenuViewportMargin = 8;
const autoFillScrollEdgeThreshold = 48;
const autoFillMaxScrollStep = 26;

type SelectionBounds = {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
};

type AutoFillDragState = {
  sourceBounds: SelectionBounds;
  targetRowIndex: number;
  targetColumnIndex: number;
};

type HeaderContextMenuState =
  | {
      kind: "row";
      rowIndex: number;
      x: number;
      y: number;
    }
  | {
      kind: "column";
      columnIndex: number;
      x: number;
      y: number;
    }
  | {
      kind: "corner";
      x: number;
      y: number;
    }
  | {
      kind: "cell";
      rowIndex: number;
      columnIndex: number;
      x: number;
      y: number;
    };

function isImeKeyboardEvent(event: React.KeyboardEvent<HTMLElement>) {
  return event.nativeEvent.isComposing || event.key === "Process" || event.nativeEvent.keyCode === 229;
}

function describeDebugElement(element: Element | null) {
  if (!element) {
    return null;
  }

  const htmlElement = element as HTMLElement;
  const className = typeof htmlElement.className === "string" ? htmlElement.className.trim().replace(/\s+/g, ".") : "";
  return `${element.tagName.toLowerCase()}${htmlElement.id ? `#${htmlElement.id}` : ""}${className ? `.${className}` : ""}`;
}

function isImeDebugEnabled() {
  try {
    return window.localStorage.getItem("lighty:ime-debug") === "1";
  } catch {
    return false;
  }
}

function pushImeDebugLog(stage: string, payload: Record<string, unknown>) {
  if (!isImeDebugEnabled()) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    ...payload,
  };
  const debugWindow = window as Window & {
    __lightyImeDebugLogs?: Array<Record<string, unknown>>;
  };

  debugWindow.__lightyImeDebugLogs = [...(debugWindow.__lightyImeDebugLogs ?? []), entry].slice(-300);
  console.debug("[Lighty IME]", entry);
}

function buildGridTemplateColumns(widths: number[], includeRowNumber: boolean) {
  const segments: string[] = [];

  if (includeRowNumber) {
    segments.push(`${rowNumberWidth}px`);
  }

  if (widths.length > 0) {
    segments.push(widths.map((width) => `${Math.max(width, 0)}px`).join(" "));
  }

  return segments.join(" ");
}

function hasColumnValidation(column: SheetColumn) {
  const validation = column.attributes.Validation;

  if (validation === null || validation === undefined) {
    return false;
  }

  if (typeof validation === "string") {
    return validation.trim().length > 0;
  }

  return true;
}

function getColumnExportScopeClassName(column: SheetColumn) {
  switch (getColumnExportScope(column).trim().toLowerCase()) {
    case "client":
      return "virtual-header-cell--export-client";
    case "server":
      return "virtual-header-cell--export-server";
    case "none":
      return null;
    case "all":
    default:
      return "virtual-header-cell--export-all";
  }
}

export function VirtualSheetTable({
  restoreScrollRequest,
  canInsertCopiedCellsDown,
  canInsertCopiedColumns,
  canInsertCopiedRows,
  columns,
  columnWidths,
  rows,
  editedCells,
  selectedCell,
  selectionRange,
  freezeRows,
  freezeColumns,
  onSelectCell,
  onSelectRow,
  onSelectColumn,
  onSelectAll,
  onEditColumn,
  onResizeColumn,
  onAutoSizeColumn,
  onFreezeRows,
  onFreezeColumns,
  onInsertRowAbove,
  onInsertRow,
  onInsertCopiedRowsAbove,
  onInsertCopiedRowsBelow,
  onDeleteRow,
  onInsertColumnBefore,
  onInsertColumn,
  onInsertCopiedColumnsBefore,
  onInsertCopiedColumnsAfter,
  onDeleteColumn,
  onInsertCopiedCellsDown,
  onAutoFillSelection,
  onCopySelection,
  onCopySelectionToClipboard,
  onCutSelection,
  onClearSelection,
  onPasteSelection,
  onPasteSelectionFromClipboard,
  onPasteIntoCurrentSelectionFromClipboard,
  onEditCell,
  onScrollSnapshotChange,
}: VirtualSheetTableProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const frozenTopRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement | HTMLSelectElement>());
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const isPointerSelectingRef = useRef(false);
  const resizeStateRef = useRef<{ columnIndex: number; startX: number; startWidth: number } | null>(null);
  const autoFillDragStateRef = useRef<AutoFillDragState | null>(null);
  const autoFillPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const autoFillScrollFrameRef = useRef<number | null>(null);
  const editFocusModeRef = useRef<"select-all" | "caret-end">("select-all");
  const [contextMenuState, setContextMenuState] = useState<HeaderContextMenuState | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [autoFillPreviewBounds, setAutoFillPreviewBounds] = useState<SelectionBounds | null>(null);

  const safeFreezeRows = Math.max(0, Math.min(freezeRows, rows.length));
  const safeFreezeColumns = Math.max(0, Math.min(freezeColumns, columns.length));
  const frozenRows = rows.slice(0, safeFreezeRows);
  const scrollRows = rows.slice(safeFreezeRows);
  const frozenColumns = columns.slice(0, safeFreezeColumns);
  const scrollColumns = columns.slice(safeFreezeColumns);
  const normalizedColumnWidths = columns.map((_, columnIndex) => columnWidths[columnIndex] ?? 140);
  const frozenColumnWidths = normalizedColumnWidths.slice(0, safeFreezeColumns);
  const scrollColumnWidths = normalizedColumnWidths.slice(safeFreezeColumns);
  const leftGridTemplateColumns = useMemo(
    () => buildGridTemplateColumns(frozenColumnWidths, true),
    [frozenColumnWidths],
  );
  const rightGridTemplateColumns = useMemo(
    () => buildGridTemplateColumns(scrollColumnWidths, false),
    [scrollColumnWidths],
  );
  const leftPaneWidth = rowNumberWidth + frozenColumnWidths.reduce((sum, width) => sum + width, 0);
  const rightPaneWidth = scrollColumnWidths.reduce((sum, width) => sum + width, 0);
  const selectedCellKey = selectedCell ? buildCellKey(selectedCell.rowIndex, selectedCell.columnIndex) : null;
  const selectedColumn = selectedCell ? (columns[selectedCell.columnIndex] ?? null) : null;
  const selectedEditorKind = selectedColumn ? getColumnEditorKind(selectedColumn) : null;
  const selectionBounds = selectionRange ? getSelectionBounds(selectionRange) : null;
  const rowVirtualizer = useVirtualizer({
    count: scrollRows.length,
    getScrollElement: () => bodyRef.current ?? leftBodyRef.current,
    estimateSize: () => rowHeight,
    overscan: overscanCount,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const fallbackVirtualRows = scrollRows.map((_, index) => ({
    index,
    size: rowHeight,
    start: index * rowHeight,
  }));
  const renderedVirtualRows = virtualRows.length > 0 ? virtualRows : fallbackVirtualRows;
  const virtualCanvasHeight = scrollRows.length > 0 ? Math.max(rowVirtualizer.getTotalSize(), scrollRows.length * rowHeight) : rowHeight;

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) {
      return;
    }

    const menuWidth = contextMenuRef.current.offsetWidth;
    const menuHeight = contextMenuRef.current.offsetHeight;
    const minLeft = contextMenuViewportMargin;
    const minTop = contextMenuViewportMargin;
    const maxLeft = Math.max(minLeft, window.innerWidth - menuWidth - contextMenuViewportMargin);
    const maxTop = Math.max(minTop, window.innerHeight - menuHeight - contextMenuViewportMargin);
    const nextX = Math.min(Math.max(contextMenuState.x, minLeft), maxLeft);
    const nextY = Math.min(Math.max(contextMenuState.y, minTop), maxTop);

    if (nextX !== contextMenuState.x || nextY !== contextMenuState.y) {
      setContextMenuState((current) => {
        if (!current) {
          return null;
        }

        return nextX === current.x && nextY === current.y
          ? current
          : { ...current, x: nextX, y: nextY };
      });
    }
  }, [contextMenuState]);

  useLayoutEffect(() => {
    const verticalScrollHost = bodyRef.current ?? leftBodyRef.current;
    if (verticalScrollHost) {
      const maxScrollTop = Math.max(0, virtualCanvasHeight - verticalScrollHost.clientHeight);
      if (verticalScrollHost.scrollTop > maxScrollTop) {
        syncVertical(maxScrollTop);
      }
    }

    if (bodyRef.current) {
      const maxScrollLeft = Math.max(0, rightPaneWidth - bodyRef.current.clientWidth);
      if (bodyRef.current.scrollLeft > maxScrollLeft) {
        syncHorizontal(maxScrollLeft, "body");
      }
    }
  }, [rightPaneWidth, safeFreezeColumns, safeFreezeRows, syncHorizontal, virtualCanvasHeight]);

  function logIme(stage: string, payload: Record<string, unknown> = {}) {
    pushImeDebugLog(stage, {
      selectedCellKey,
      editingCellKey,
      selectedEditorKind,
      activeElement: describeDebugElement(document.activeElement),
      ...payload,
    });
  }

  function syncHorizontal(scrollLeft: number, source: "header" | "frozen" | "body") {
    if (source !== "header" && headerRef.current && headerRef.current.scrollLeft !== scrollLeft) {
      headerRef.current.scrollLeft = scrollLeft;
    }

    if (source !== "frozen" && frozenTopRef.current && frozenTopRef.current.scrollLeft !== scrollLeft) {
      frozenTopRef.current.scrollLeft = scrollLeft;
    }

    if (source !== "body" && bodyRef.current && bodyRef.current.scrollLeft !== scrollLeft) {
      bodyRef.current.scrollLeft = scrollLeft;
    }
  }

  function setVerticalScroll(scrollTop: number) {
    if (leftBodyRef.current && leftBodyRef.current.scrollTop !== scrollTop) {
      leftBodyRef.current.scrollTop = scrollTop;
    }

    if (bodyRef.current && bodyRef.current.scrollTop !== scrollTop) {
      bodyRef.current.scrollTop = scrollTop;
    }
  }

  function syncVertical(scrollTop: number) {
    setVerticalScroll(scrollTop);
  }

  function getBodyScrollHost() {
    return bodyRef.current ?? leftBodyRef.current;
  }

  function stopAutoFillScrollLoop() {
    if (autoFillScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoFillScrollFrameRef.current);
      autoFillScrollFrameRef.current = null;
    }
  }

  function isPointOutsideBounds(point: { rowIndex: number; columnIndex: number }, bounds: SelectionBounds) {
    return (
      point.rowIndex < bounds.startRowIndex ||
      point.rowIndex > bounds.endRowIndex ||
      point.columnIndex < bounds.startColumnIndex ||
      point.columnIndex > bounds.endColumnIndex
    );
  }

  function buildAutoFillPreviewBounds(sourceBounds: SelectionBounds, targetRowIndex: number, targetColumnIndex: number) {
    if (!isPointOutsideBounds({ rowIndex: targetRowIndex, columnIndex: targetColumnIndex }, sourceBounds)) {
      return null;
    }

    return {
      startRowIndex: Math.min(sourceBounds.startRowIndex, targetRowIndex),
      endRowIndex: Math.max(sourceBounds.endRowIndex, targetRowIndex),
      startColumnIndex: Math.min(sourceBounds.startColumnIndex, targetColumnIndex),
      endColumnIndex: Math.max(sourceBounds.endColumnIndex, targetColumnIndex),
    };
  }

  function getCellFromPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const cellElement = element instanceof HTMLElement
      ? element.closest<HTMLElement>("[data-row-index][data-column-index]")
      : null;

    if (!cellElement) {
      return null;
    }

    const rowIndex = Number(cellElement.dataset.rowIndex ?? "");
    const columnIndex = Number(cellElement.dataset.columnIndex ?? "");
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) {
      return null;
    }

    return { rowIndex, columnIndex };
  }

  function updateAutoFillTarget(clientX: number, clientY: number) {
    const dragState = autoFillDragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextTarget = getCellFromPoint(clientX, clientY);
    if (!nextTarget) {
      return;
    }

    const previewBounds = buildAutoFillPreviewBounds(dragState.sourceBounds, nextTarget.rowIndex, nextTarget.columnIndex);
    dragState.targetRowIndex = nextTarget.rowIndex;
    dragState.targetColumnIndex = nextTarget.columnIndex;
    setAutoFillPreviewBounds((current) => {
      if (
        current?.startRowIndex === previewBounds?.startRowIndex &&
        current?.endRowIndex === previewBounds?.endRowIndex &&
        current?.startColumnIndex === previewBounds?.startColumnIndex &&
        current?.endColumnIndex === previewBounds?.endColumnIndex
      ) {
        return current;
      }

      return previewBounds;
    });
  }

  function getAutoFillScrollStep(pointer: number, min: number, max: number) {
    if (pointer < min + autoFillScrollEdgeThreshold) {
      const intensity = Math.min((min + autoFillScrollEdgeThreshold - pointer) / autoFillScrollEdgeThreshold, 1);
      return -Math.max(1, Math.round(intensity * autoFillMaxScrollStep));
    }

    if (pointer > max - autoFillScrollEdgeThreshold) {
      const intensity = Math.min((pointer - (max - autoFillScrollEdgeThreshold)) / autoFillScrollEdgeThreshold, 1);
      return Math.max(1, Math.round(intensity * autoFillMaxScrollStep));
    }

    return 0;
  }

  function isPointerNearAutoFillEdge(pointer: { clientX: number; clientY: number }) {
    const verticalHost = getBodyScrollHost();
    const horizontalHost = bodyRef.current;
    if (!verticalHost) {
      return false;
    }

    const verticalRect = verticalHost.getBoundingClientRect();
    const isNearVerticalEdge =
      pointer.clientY <= verticalRect.top + autoFillScrollEdgeThreshold ||
      pointer.clientY >= verticalRect.bottom - autoFillScrollEdgeThreshold;
    if (isNearVerticalEdge) {
      return true;
    }

    if (!horizontalHost) {
      return false;
    }

    const horizontalRect = horizontalHost.getBoundingClientRect();
    return (
      pointer.clientX <= horizontalRect.left + autoFillScrollEdgeThreshold ||
      pointer.clientX >= horizontalRect.right - autoFillScrollEdgeThreshold
    );
  }

  function stepAutoFillScroll() {
    const pointer = autoFillPointerRef.current;
    const verticalHost = getBodyScrollHost();
    const horizontalHost = bodyRef.current;
    if (!pointer || !verticalHost || !autoFillDragStateRef.current) {
      autoFillScrollFrameRef.current = null;
      return;
    }

    let nextScrollLeft = horizontalHost?.scrollLeft ?? 0;
    let nextScrollTop = verticalHost.scrollTop;
    let didScroll = false;

    const verticalRect = verticalHost.getBoundingClientRect();
    const verticalStep = getAutoFillScrollStep(pointer.clientY, verticalRect.top, verticalRect.bottom);
    if (verticalStep !== 0) {
      const maxScrollTop = Math.max(0, verticalHost.scrollHeight - verticalHost.clientHeight);
      const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, verticalHost.scrollTop + verticalStep));
      if (clampedScrollTop !== verticalHost.scrollTop) {
        nextScrollTop = clampedScrollTop;
        syncVertical(clampedScrollTop);
        didScroll = true;
      }
    }

    if (horizontalHost) {
      const horizontalRect = horizontalHost.getBoundingClientRect();
      const horizontalStep = getAutoFillScrollStep(pointer.clientX, horizontalRect.left, horizontalRect.right);
      if (horizontalStep !== 0) {
        const maxScrollLeft = Math.max(0, horizontalHost.scrollWidth - horizontalHost.clientWidth);
        const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, horizontalHost.scrollLeft + horizontalStep));
        if (clampedScrollLeft !== horizontalHost.scrollLeft) {
          nextScrollLeft = clampedScrollLeft;
          syncHorizontal(clampedScrollLeft, "body");
          didScroll = true;
        }
      }
    }

    if (didScroll) {
      emitScrollSnapshot(nextScrollLeft, nextScrollTop);
    }

    updateAutoFillTarget(pointer.clientX, pointer.clientY);

    if (didScroll || isPointerNearAutoFillEdge(pointer)) {
      autoFillScrollFrameRef.current = window.requestAnimationFrame(stepAutoFillScroll);
      return;
    }

    autoFillScrollFrameRef.current = null;
  }

  function ensureAutoFillScrollLoop() {
    if (autoFillScrollFrameRef.current !== null || !autoFillDragStateRef.current || !autoFillPointerRef.current) {
      return;
    }

    autoFillScrollFrameRef.current = window.requestAnimationFrame(stepAutoFillScroll);
  }

  function startAutoFillDrag(event: React.MouseEvent<HTMLButtonElement>) {
    if (!selectionBounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    autoFillDragStateRef.current = {
      sourceBounds: selectionBounds,
      targetRowIndex: selectionBounds.endRowIndex,
      targetColumnIndex: selectionBounds.endColumnIndex,
    };
    autoFillPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    setAutoFillPreviewBounds(null);
    ensureAutoFillScrollLoop();
  }

  function finishAutoFillDrag() {
    const dragState = autoFillDragStateRef.current;
    stopAutoFillScrollLoop();
    autoFillPointerRef.current = null;
    autoFillDragStateRef.current = null;
    setAutoFillPreviewBounds(null);

    if (!dragState) {
      return;
    }

    if (!isPointOutsideBounds({ rowIndex: dragState.targetRowIndex, columnIndex: dragState.targetColumnIndex }, dragState.sourceBounds)) {
      return;
    }

    onAutoFillSelection(dragState.targetRowIndex, dragState.targetColumnIndex);
  }

  function emitScrollSnapshot(nextScrollLeft?: number, nextScrollTop?: number) {
    if (!onScrollSnapshotChange) {
      return;
    }

    onScrollSnapshotChange({
      scrollLeft: nextScrollLeft ?? bodyRef.current?.scrollLeft ?? headerRef.current?.scrollLeft ?? frozenTopRef.current?.scrollLeft ?? 0,
      scrollTop: nextScrollTop ?? bodyRef.current?.scrollTop ?? leftBodyRef.current?.scrollTop ?? 0,
    });
  }

  useEffect(() => {
    if (!selectedCell) {
      return;
    }

    const visibleRowIndex = rows.findIndex((row) => row.rowIndex === selectedCell.rowIndex);
    if (visibleRowIndex >= safeFreezeRows) {
      rowVirtualizer.scrollToIndex(visibleRowIndex - safeFreezeRows, { align: "auto" });
    }

  }, [rowVirtualizer, rows, safeFreezeRows, selectedCell]);

  useLayoutEffect(() => {
    if (!restoreScrollRequest) {
      return;
    }

    const nextScrollTop = Math.max(0, restoreScrollRequest.scrollTop);
    const nextScrollLeft = Math.max(0, restoreScrollRequest.scrollLeft);

    syncHorizontal(nextScrollLeft, "body");
    setVerticalScroll(nextScrollTop);
    emitScrollSnapshot(nextScrollLeft, nextScrollTop);
  }, [restoreScrollRequest, rightPaneWidth, virtualCanvasHeight]);

  useEffect(() => {
    const targetElement = selectedCellKey
      ? (editingCellKey === selectedCellKey
        ? inputRefs.current.get(selectedCellKey)
        : cellRefs.current.get(selectedCellKey))
      : null;

    if (!targetElement) {
      return;
    }

    logIme("focus.effect.schedule", {
      targetElement: describeDebugElement(targetElement),
    });

    const frameId = window.requestAnimationFrame(() => {
      if (!targetElement || targetElement === document.activeElement) {
        logIme("focus.effect.skip", {
          reason: !targetElement ? "no-target" : "already-active",
          targetElement: describeDebugElement(targetElement),
        });
        return;
      }

      if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLSelectElement) {
        applyInputFocusMode(targetElement);
        logIme("focus.effect.editor-focused", {
          targetElement: describeDebugElement(targetElement),
        });
        return;
      }

      (targetElement as HTMLDivElement).focus();
      logIme("focus.effect.cell-focused", {
        targetElement: describeDebugElement(targetElement),
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [editingCellKey, selectedCellKey, selectedEditorKind]);

  useEffect(() => {
    if (!selectedCellKey) {
      setEditingCellKey(null);
      return;
    }

    if (editingCellKey && editingCellKey !== selectedCellKey) {
      setEditingCellKey(null);
    }
  }, [editingCellKey, selectedCellKey]);

  useEffect(() => {
    const handlePointerRelease = () => {
      isPointerSelectingRef.current = false;
      resizeStateRef.current = null;
      finishAutoFillDrag();
    };

    const handlePointerMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) {
        if (!autoFillDragStateRef.current) {
          return;
        }

        autoFillPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        updateAutoFillTarget(event.clientX, event.clientY);
        ensureAutoFillScrollLoop();
        return;
      }

      const nextWidth = resizeStateRef.current.startWidth + (event.clientX - resizeStateRef.current.startX);
      onResizeColumn(resizeStateRef.current.columnIndex, nextWidth);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
    };

    const handleWindowMouseDown = () => {
      setContextMenuState(null);
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("mousedown", handleWindowMouseDown);
    return () => {
      stopAutoFillScrollLoop();
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handleWindowMouseDown);
    };
  }, [onAutoFillSelection, onResizeColumn]);

  useEffect(() => {
    if (autoFillDragStateRef.current) {
      return;
    }

    setAutoFillPreviewBounds(null);
  }, [selectionBounds]);

  function moveSelection(
    originRowIndex: number,
    originColumnIndex: number,
    rowDelta: number,
    columnDelta: number,
    extendSelection = false,
  ) {
    const visibleRowIndex = rows.findIndex((row) => row.rowIndex === originRowIndex);
    if (visibleRowIndex < 0 || columns.length === 0) {
      return;
    }

    const nextVisibleRowIndex = Math.max(0, Math.min(rows.length - 1, visibleRowIndex + rowDelta));
    const nextColumnIndex = Math.max(0, Math.min(columns.length - 1, originColumnIndex + columnDelta));
    const nextRow = rows[nextVisibleRowIndex];

    if (!nextRow) {
      return;
    }

    onSelectCell(nextRow.rowIndex, nextColumnIndex, { extendSelection });
  }

  function registerInputRef(cellKey: string, element: HTMLInputElement | HTMLSelectElement | null) {
    if (element) {
      inputRefs.current.set(cellKey, element);
      return;
    }

    inputRefs.current.delete(cellKey);
  }

  function registerCellRef(cellKey: string, element: HTMLDivElement | null) {
    if (element) {
      cellRefs.current.set(cellKey, element);
      return;
    }

    cellRefs.current.delete(cellKey);
  }

  function applyInputFocusMode(targetElement: HTMLInputElement | HTMLSelectElement) {
    targetElement.focus();
    logIme("editor.apply-focus-mode", {
      targetElement: describeDebugElement(targetElement),
      focusMode: editFocusModeRef.current,
      value: targetElement instanceof HTMLInputElement ? targetElement.value : targetElement.value,
    });

    if (targetElement instanceof HTMLInputElement) {
      if (editFocusModeRef.current === "select-all") {
        targetElement.select();
      } else {
        const nextLength = targetElement.value.length;
        targetElement.setSelectionRange(nextLength, nextLength);
      }
    }
  }

  function startEditingCell(
    rowIndex: number,
    columnIndex: number,
    focusMode: "select-all" | "caret-end" = "select-all",
    options?: { immediateFocus?: boolean },
  ) {
    const cellKey = buildCellKey(rowIndex, columnIndex);
    editFocusModeRef.current = focusMode;
    logIme("editor.start", {
      cellKey,
      rowIndex,
      columnIndex,
      focusMode,
      immediateFocus: options?.immediateFocus ?? false,
    });

    if (options?.immediateFocus) {
      flushSync(() => {
        onSelectCell(rowIndex, columnIndex);
        setEditingCellKey(cellKey);
      });

      const targetInput = inputRefs.current.get(cellKey);
      if (targetInput) {
        applyInputFocusMode(targetInput);
      } else {
        logIme("editor.start.immediate-missing-input", {
          cellKey,
        });
      }

      return;
    }

    onSelectCell(rowIndex, columnIndex);
    setEditingCellKey(cellKey);
  }

  function stopEditingCell() {
    logIme("editor.stop");
    setEditingCellKey(null);
  }

  function handleCellKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
  ) {
    const currentTarget = event.currentTarget;
    logIme("editor.keydown", {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
      value: currentTarget.value,
    });

    if (currentTarget instanceof HTMLInputElement && isImeKeyboardEvent(event)) {
      logIme("editor.keydown.ime-bypass", {
        key: event.key,
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      stopEditingCell();
      moveSelection(rowIndex, columnIndex, event.shiftKey ? -1 : 1, 0);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      stopEditingCell();
      moveSelection(rowIndex, columnIndex, 0, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, -1, 0, event.shiftKey);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 1, 0, event.shiftKey);
      return;
    }

    if (currentTarget instanceof HTMLSelectElement && event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 0, -1, event.shiftKey);
      return;
    }

    if (currentTarget instanceof HTMLSelectElement && event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 0, 1, event.shiftKey);
      return;
    }

    if (currentTarget instanceof HTMLInputElement && event.key === "ArrowLeft") {
      const selectionStart = currentTarget.selectionStart ?? 0;
      const selectionEnd = currentTarget.selectionEnd ?? 0;
      if (selectionStart === 0 && selectionEnd === 0) {
        event.preventDefault();
        stopEditingCell();
        moveSelection(rowIndex, columnIndex, 0, -1, event.shiftKey);
      }
      return;
    }

    if (currentTarget instanceof HTMLInputElement && event.key === "ArrowRight") {
      const selectionStart = currentTarget.selectionStart ?? currentTarget.value.length;
      const selectionEnd = currentTarget.selectionEnd ?? currentTarget.value.length;
      if (selectionStart === currentTarget.value.length && selectionEnd === currentTarget.value.length) {
        event.preventDefault();
        stopEditingCell();
        moveSelection(rowIndex, columnIndex, 0, 1, event.shiftKey);
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      stopEditingCell();
    }
  }

  function handleCellShellKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number,
    editorKind: ReturnType<typeof getColumnEditorKind>,
  ) {
    const cellKey = buildCellKey(rowIndex, columnIndex);
    logIme("cell-shell.keydown", {
      cellKey,
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
      editorKind,
    });

    if (editingCellKey === cellKey) {
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEditingCell(rowIndex, columnIndex, "select-all", { immediateFocus: true });
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 0, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, -1, 0, event.shiftKey);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 1, 0, event.shiftKey);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 0, -1, event.shiftKey);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(rowIndex, columnIndex, 0, 1, event.shiftKey);
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      onClearSelection();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      onCopySelectionToClipboard();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      onCutSelection();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      onPasteSelectionFromClipboard(rowIndex, columnIndex);
    }
  }

  function isCellInRange(rowIndex: number, columnIndex: number) {
    return Boolean(
      selectionBounds &&
      rowIndex >= selectionBounds.startRowIndex &&
      rowIndex <= selectionBounds.endRowIndex &&
      columnIndex >= selectionBounds.startColumnIndex &&
      columnIndex <= selectionBounds.endColumnIndex,
    );
  }

  function isCellInAutoFillPreview(rowIndex: number, columnIndex: number) {
    if (!autoFillPreviewBounds) {
      return false;
    }

    const isInPreviewBounds =
      rowIndex >= autoFillPreviewBounds.startRowIndex &&
      rowIndex <= autoFillPreviewBounds.endRowIndex &&
      columnIndex >= autoFillPreviewBounds.startColumnIndex &&
      columnIndex <= autoFillPreviewBounds.endColumnIndex;
    if (!isInPreviewBounds) {
      return false;
    }

    return !isCellInRange(rowIndex, columnIndex);
  }

  function openContextMenu(event: React.MouseEvent, nextState: HeaderContextMenuState) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuState(nextState);
  }

  function handleColumnResizeStart(event: React.MouseEvent, columnIndex: number) {
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      columnIndex,
      startX: event.clientX,
      startWidth: normalizedColumnWidths[columnIndex] ?? 140,
    };
  }

  function runContextMenuAction(action: () => void) {
    action();
    setContextMenuState(null);
  }

  function isWholeRowSelectionAt(rowIndex: number) {
    return Boolean(
      selectionBounds &&
      columns.length > 0 &&
      selectionBounds.startColumnIndex === 0 &&
      selectionBounds.endColumnIndex === columns.length - 1 &&
      rowIndex >= selectionBounds.startRowIndex &&
      rowIndex <= selectionBounds.endRowIndex,
    );
  }

  function isWholeColumnSelectionAt(columnIndex: number) {
    const firstVisibleRowIndex = rows[0]?.rowIndex;
    const lastVisibleRowIndex = rows[rows.length - 1]?.rowIndex;

    return Boolean(
      selectionBounds &&
      rows.length > 0 &&
      firstVisibleRowIndex !== undefined &&
      lastVisibleRowIndex !== undefined &&
      selectionBounds.startRowIndex === firstVisibleRowIndex &&
      selectionBounds.endRowIndex === lastVisibleRowIndex &&
      columnIndex >= selectionBounds.startColumnIndex &&
      columnIndex <= selectionBounds.endColumnIndex,
    );
  }

  function renderHeaderCells(columnSubset: SheetColumn[], columnOffset: number) {
    return columnSubset.map((column, offset) => {
      const columnIndex = columnOffset + offset;
      const isSelectedColumn = selectedCell?.columnIndex === columnIndex;
      const isInRangeColumn = Boolean(
        selectionBounds &&
        columnIndex >= selectionBounds.startColumnIndex &&
        columnIndex <= selectionBounds.endColumnIndex,
      );
      const displayLabel = column.displayName || column.fieldName;
      const showFieldName = Boolean(column.displayName && column.displayName !== column.fieldName);
      const exportScopeClassName = getColumnExportScopeClassName(column);
      const hasValidation = hasColumnValidation(column);

      return (
        <div
          className={`virtual-header-cell is-actionable${isSelectedColumn ? " is-selected-column" : ""}${isInRangeColumn ? " is-in-range-column" : ""}${exportScopeClassName ? ` ${exportScopeClassName}` : ""}${hasValidation ? " has-validation" : ""}`}
          key={column.fieldName}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            onSelectColumn(columnIndex, { extendSelection: event.shiftKey });
          }}
          onContextMenu={(event) => {
            if (event.shiftKey || !isWholeColumnSelectionAt(columnIndex)) {
              onSelectColumn(columnIndex, { extendSelection: event.shiftKey });
            }
            openContextMenu(event, {
              kind: "column",
              columnIndex,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {exportScopeClassName ? <span aria-hidden="true" className="virtual-header-export-strip" /> : null}
          <div className="virtual-header-title-row">
            <div className="virtual-header-label">{displayLabel}</div>
            {showFieldName ? <small className="virtual-header-field-name">{column.fieldName}</small> : null}
          </div>
          <div className="virtual-header-meta">
            <small>{column.type}</small>
          </div>
          {hasValidation ? <span aria-hidden="true" className="virtual-header-validation-corner" /> : null}
          <button
            aria-label={`调整列宽 ${displayLabel}`}
            className="virtual-column-resizer"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAutoSizeColumn(columnIndex);
            }}
            onMouseDown={(event) => handleColumnResizeStart(event, columnIndex)}
            type="button"
          />
        </div>
      );
    });
  }

  function renderCell(rowEntry: { row: string[]; rowIndex: number }, column: SheetColumn, columnIndex: number) {
    const cellKey = buildCellKey(rowEntry.rowIndex, columnIndex);
    const isDirty = Object.prototype.hasOwnProperty.call(editedCells, cellKey);
    const editorKind = getColumnEditorKind(column);
    const cellValue = rowEntry.row[columnIndex] ?? "";
    const isSelected = selectedCell?.rowIndex === rowEntry.rowIndex && selectedCell?.columnIndex === columnIndex;
    const isInRange = isCellInRange(rowEntry.rowIndex, columnIndex);
    const isInAutoFillPreview = isCellInAutoFillPreview(rowEntry.rowIndex, columnIndex);
    const isEditing = editingCellKey === cellKey;
    const isAutoFillHandleCell = Boolean(
      selectionBounds &&
      rowEntry.rowIndex === selectionBounds.endRowIndex &&
      columnIndex === selectionBounds.endColumnIndex,
    );

    return (
      <div
        className={`virtual-cell is-${editorKind}${isDirty ? " is-dirty" : ""}${isSelected ? " is-selected" : ""}${isInRange ? " is-in-range" : ""}${isInAutoFillPreview ? " is-autofill-preview" : ""}`}
        data-column-index={columnIndex}
        data-row-index={rowEntry.rowIndex}
        key={`${column.fieldName}-${rowEntry.rowIndex}`}
        onCompositionStart={() => {
          logIme("cell-shell.compositionstart", {
            cellKey,
            isEditing,
          });
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          isPointerSelectingRef.current = true;
          logIme("cell-shell.mousedown", {
            cellKey,
            button: event.button,
            shiftKey: event.shiftKey,
          });

          if (!event.shiftKey) {
            flushSync(() => {
              onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: false });
            });

            return;
          }

          onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: true });
        }}
        onDoubleClick={() => {
          logIme("cell-shell.doubleclick", {
            cellKey,
          });
          startEditingCell(rowEntry.rowIndex, columnIndex, "select-all", { immediateFocus: true });
        }}
        onMouseEnter={() => {
          if (!isPointerSelectingRef.current) {
            return;
          }

          onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: true });
        }}
        onContextMenu={(event) => {
          if (event.shiftKey || !isInRange) {
            onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: event.shiftKey });
          }
          openContextMenu(event, {
            kind: "cell",
            rowIndex: rowEntry.rowIndex,
            columnIndex,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        ref={(element) => registerCellRef(cellKey, element)}
        role="gridcell"
        tabIndex={isSelected && !isEditing ? 0 : -1}
        onKeyDown={(event) => handleCellShellKeyDown(event, rowEntry.rowIndex, columnIndex, editorKind)}
        onPaste={(event) => {
          event.preventDefault();
          onPasteSelection(rowEntry.rowIndex, columnIndex, event.clipboardData.getData("text/plain"));
        }}
      >
        {editorKind === "boolean" && isEditing ? (
          <select
            className="virtual-cell-input virtual-cell-select"
            onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
            onCopy={(event) => {
              event.preventDefault();
              event.clipboardData.setData("text/plain", onCopySelection());
            }}
            onFocus={() => {
              logIme("editor.focus", {
                cellKey,
              });
              if (!isSelected) {
                onSelectCell(rowEntry.rowIndex, columnIndex);
              }
            }}
            onBlur={() => {
              logIme("editor.blur", {
                cellKey,
              });
              stopEditingCell();
            }}
            onKeyDown={(event) => handleCellKeyDown(event, rowEntry.rowIndex, columnIndex)}
            onPaste={(event) => {
              event.preventDefault();
              onPasteSelection(rowEntry.rowIndex, columnIndex, event.clipboardData.getData("text/plain"));
            }}
            ref={(element) => registerInputRef(cellKey, element)}
            value={cellValue}
          >
            <option value="">(empty)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : null}

        {editorKind !== "boolean" && isEditing ? (
          <input
            className={`virtual-cell-input${editorKind === "reference" || editorKind === "list" ? " is-code" : ""}`}
            inputMode={editorKind === "number" ? "decimal" : "text"}
            onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
            onCopy={(event) => {
              event.preventDefault();
              event.clipboardData.setData("text/plain", onCopySelection());
            }}
            onFocus={() => {
              logIme("editor.focus", {
                cellKey,
              });
              if (!isSelected) {
                onSelectCell(rowEntry.rowIndex, columnIndex);
              }
            }}
            onBlur={() => {
              logIme("editor.blur", {
                cellKey,
              });
              stopEditingCell();
            }}
            onKeyDown={(event) => handleCellKeyDown(event, rowEntry.rowIndex, columnIndex)}
            onCompositionStart={(event) => {
              logIme("editor.compositionstart", {
                cellKey,
                data: event.data,
                value: event.currentTarget.value,
              });
            }}
            onCompositionUpdate={(event) => {
              logIme("editor.compositionupdate", {
                cellKey,
                data: event.data,
                value: event.currentTarget.value,
              });
            }}
            onCompositionEnd={(event) => {
              logIme("editor.compositionend", {
                cellKey,
                data: event.data,
                value: event.currentTarget.value,
              });
            }}
            onInput={(event) => {
              const nativeEvent = event.nativeEvent as InputEvent;
              logIme("editor.input", {
                cellKey,
                value: event.currentTarget.value,
                data: nativeEvent.data ?? null,
                inputType: nativeEvent.inputType ?? null,
                isComposing: nativeEvent.isComposing ?? false,
              });
            }}
            onPaste={(event) => {
              event.preventDefault();
              onPasteSelection(rowEntry.rowIndex, columnIndex, event.clipboardData.getData("text/plain"));
            }}
            placeholder={
              editorKind === "reference"
                ? "[[id]]"
                : editorKind === "list"
                  ? "逗号分隔值"
                  : undefined
            }
            ref={(element) => registerInputRef(cellKey, element)}
            spellCheck={editorKind === "reference" || editorKind === "list" ? false : true}
            type="text"
            value={cellValue}
          />
        ) : null}

        {!isEditing ? <span className={`virtual-cell-display${editorKind === "reference" || editorKind === "list" ? " is-code" : ""}`}>{cellValue || " "}</span> : null}
        {isAutoFillHandleCell && !isEditing ? (
          <button
            aria-label="拖动填充选区"
            className="virtual-cell-autofill-handle"
            onMouseDown={startAutoFillDrag}
            type="button"
          />
        ) : null}
      </div>
    );
  }

  function renderLeftRow(rowEntry: { row: string[]; rowIndex: number }, className = "") {
    const isSelectedRow = selectedCell?.rowIndex === rowEntry.rowIndex;
    const isInRangeRow = Boolean(
      selectionBounds &&
      rowEntry.rowIndex >= selectionBounds.startRowIndex &&
      rowEntry.rowIndex <= selectionBounds.endRowIndex,
    );

    return (
      <div className={`virtual-table-row ${className}`.trim()} style={{ gridTemplateColumns: leftGridTemplateColumns, height: rowHeight }}>
        <div
          className={`virtual-row-number row-number-cell is-actionable${isSelectedRow ? " is-selected-row" : ""}${isInRangeRow ? " is-in-range-row" : ""}`}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            onSelectRow(rowEntry.rowIndex, { extendSelection: event.shiftKey });
          }}
          onContextMenu={(event) => {
            if (event.shiftKey || !isWholeRowSelectionAt(rowEntry.rowIndex)) {
              onSelectRow(rowEntry.rowIndex, { extendSelection: event.shiftKey });
            }
            openContextMenu(event, {
              kind: "row",
              rowIndex: rowEntry.rowIndex,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {rowEntry.rowIndex + 1}
        </div>
        {frozenColumns.map((column, columnIndex) => renderCell(rowEntry, column, columnIndex))}
      </div>
    );
  }

  function renderRightRow(rowEntry: { row: string[]; rowIndex: number }, className = "") {
    if (scrollColumns.length === 0) {
      return null;
    }

    return (
      <div className={`virtual-table-row ${className}`.trim()} style={{ gridTemplateColumns: rightGridTemplateColumns, height: rowHeight }}>
        {scrollColumns.map((column, offset) => renderCell(rowEntry, column, safeFreezeColumns + offset))}
      </div>
    );
  }

  return (
    <div
      className={`virtual-table-shell${safeFreezeRows > 0 || safeFreezeColumns > 0 ? " has-freeze" : ""}`}
      style={{
        gridTemplateColumns: rightPaneWidth > 0 ? `${leftPaneWidth}px minmax(0, 1fr)` : `${leftPaneWidth}px 0px`,
        gridTemplateRows: safeFreezeRows > 0 ? `auto ${safeFreezeRows * rowHeight}px minmax(0, 1fr)` : "auto 0px minmax(0, 1fr)",
      }}
    >
      <div className="virtual-pane virtual-pane-corner">
        <div className="virtual-table-header" style={{ gridTemplateColumns: leftGridTemplateColumns, width: leftPaneWidth }}>
          <div
            className={`virtual-header-cell row-number-cell is-header is-actionable${selectionBounds ? " is-in-range-column is-selected-column" : ""}`}
            onMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              onSelectAll();
            }}
            onContextMenu={(event) => {
              onSelectAll();
              openContextMenu(event, {
                kind: "corner",
                x: event.clientX,
                y: event.clientY,
              });
            }}
          >
            #
          </div>
          {renderHeaderCells(frozenColumns, 0)}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-header-scroll${scrollColumns.length === 0 ? " is-hidden" : ""}`}
        onScroll={(event) => {
          syncHorizontal(event.currentTarget.scrollLeft, "header");
          emitScrollSnapshot(event.currentTarget.scrollLeft);
        }}
        ref={headerRef}
      >
        <div className="virtual-table-header" style={{ gridTemplateColumns: rightGridTemplateColumns, width: rightPaneWidth }}>
          {renderHeaderCells(scrollColumns, safeFreezeColumns)}
        </div>
      </div>

      <div className={`virtual-pane virtual-pane-frozen-left${safeFreezeRows === 0 ? " is-hidden" : ""}`}>
        <div className="virtual-table-static" style={{ width: leftPaneWidth }}>
          {frozenRows.map((rowEntry) => (
            <Fragment key={`frozen-left-${rowEntry.rowIndex}`}>
              {renderLeftRow(rowEntry)}
            </Fragment>
          ))}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-frozen-top-scroll${safeFreezeRows === 0 || scrollColumns.length === 0 ? " is-hidden" : ""}`}
        onScroll={(event) => {
          syncHorizontal(event.currentTarget.scrollLeft, "frozen");
          emitScrollSnapshot(event.currentTarget.scrollLeft);
        }}
        ref={frozenTopRef}
      >
        <div className="virtual-table-static" style={{ width: rightPaneWidth }}>
          {frozenRows.map((rowEntry) => (
            <Fragment key={`frozen-right-${rowEntry.rowIndex}`}>
              {renderRightRow(rowEntry)}
            </Fragment>
          ))}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-left-body${scrollColumns.length === 0 ? " is-scroll-host" : ""}`}
        onScroll={
          scrollColumns.length === 0
            ? (event) => {
              syncVertical(event.currentTarget.scrollTop);
              emitScrollSnapshot(undefined, event.currentTarget.scrollTop);
            }
            : undefined
        }
        ref={leftBodyRef}
      >
        <div className="virtual-table-canvas" style={{ height: virtualCanvasHeight, width: leftPaneWidth }}>
          {renderedVirtualRows.map((virtualRow) => {
            const rowEntry = scrollRows[virtualRow.index];

            return rowEntry ? (
              <div
                className="virtual-table-virtual-row"
                key={`left-${rowEntry.rowIndex}`}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderLeftRow(rowEntry, "is-virtual")}
              </div>
            ) : null;
          })}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-main-body${scrollColumns.length === 0 ? " is-hidden" : ""}`}
        onScroll={(event) => {
          syncHorizontal(event.currentTarget.scrollLeft, "body");
          syncVertical(event.currentTarget.scrollTop);
          emitScrollSnapshot(event.currentTarget.scrollLeft, event.currentTarget.scrollTop);
        }}
        ref={bodyRef}
      >
        <div className="virtual-table-canvas" style={{ height: virtualCanvasHeight, width: rightPaneWidth }}>
          {renderedVirtualRows.map((virtualRow) => {
            const rowEntry = scrollRows[virtualRow.index];

            return rowEntry ? (
              <div
                className="virtual-table-virtual-row"
                key={`right-${rowEntry.rowIndex}`}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRightRow(rowEntry, "is-virtual")}
              </div>
            ) : null;
          })}
        </div>
      </div>

      {rows.length === 0 ? <div className="virtual-table-empty-note">没有匹配当前筛选条件的数据。</div> : null}

      {contextMenuState ? (
        <div
          className="sheet-context-menu"
          onMouseDown={(event) => event.stopPropagation()}
          ref={contextMenuRef}
          style={{ left: contextMenuState.x, top: contextMenuState.y }}
        >
          {contextMenuState.kind === "cell" ? (
            <>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onPasteIntoCurrentSelectionFromClipboard())} type="button">
                粘贴到当前选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCopySelectionToClipboard)} type="button">
                复制选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCutSelection)} type="button">
                剪切选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onClearSelection)} type="button">
                清空选区
              </button>
              {canInsertCopiedCellsDown ? (
                <button
                  className="sheet-context-menu-item"
                  onClick={() => runContextMenuAction(() => onInsertCopiedCellsDown(contextMenuState.rowIndex, contextMenuState.columnIndex))}
                  type="button"
                >
                  从当前单元格向下插入复制内容
                </button>
              ) : null}
            </>
          ) : null}

          {contextMenuState.kind === "row" ? (
            <>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onSelectRow(contextMenuState.rowIndex))} type="button">
                选择整行
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertRowAbove(contextMenuState.rowIndex))} type="button">
                在上方插入行
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertRow(contextMenuState.rowIndex))} type="button">
                在下方插入行
              </button>
              {canInsertCopiedRows ? (
                <>
                  <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertCopiedRowsAbove(contextMenuState.rowIndex))} type="button">
                    在上方插入复制行
                  </button>
                  <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertCopiedRowsBelow(contextMenuState.rowIndex))} type="button">
                    在下方插入复制行
                  </button>
                </>
              ) : null}
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onDeleteRow(contextMenuState.rowIndex))} type="button">
                删除当前行
              </button>
              <button
                className="sheet-context-menu-item"
                onClick={() => runContextMenuAction(() => onFreezeRows(rows.findIndex((entry) => entry.rowIndex === contextMenuState.rowIndex) + 1))}
                type="button"
              >
                冻结到此行
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCopySelectionToClipboard)} type="button">
                复制选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onPasteIntoCurrentSelectionFromClipboard())} type="button">
                粘贴到当前选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCutSelection)} type="button">
                剪切选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onClearSelection)} type="button">
                清空选区
              </button>
            </>
          ) : null}

          {contextMenuState.kind === "column" ? (
            <>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onSelectColumn(contextMenuState.columnIndex))} type="button">
                选择整列
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertColumnBefore(contextMenuState.columnIndex))} type="button">
                在左侧插入列
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertColumn(contextMenuState.columnIndex))} type="button">
                在右侧插入列
              </button>
              {canInsertCopiedColumns ? (
                <>
                  <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertCopiedColumnsBefore(contextMenuState.columnIndex))} type="button">
                    在左侧插入复制列
                  </button>
                  <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onInsertCopiedColumnsAfter(contextMenuState.columnIndex))} type="button">
                    在右侧插入复制列
                  </button>
                </>
              ) : null}
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onDeleteColumn(contextMenuState.columnIndex))} type="button">
                删除当前列
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onEditColumn(contextMenuState.columnIndex))} type="button">
                编辑表头
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onAutoSizeColumn(contextMenuState.columnIndex))} type="button">
                自动适配列宽
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onFreezeColumns(contextMenuState.columnIndex + 1))} type="button">
                冻结到此列
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCopySelectionToClipboard)} type="button">
                复制选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onPasteIntoCurrentSelectionFromClipboard())} type="button">
                粘贴到当前选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCutSelection)} type="button">
                剪切选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onClearSelection)} type="button">
                清空选区
              </button>
            </>
          ) : null}

          {contextMenuState.kind === "corner" ? (
            <>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onSelectAll)} type="button">
                全选可见区域
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCopySelectionToClipboard)} type="button">
                复制选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onPasteIntoCurrentSelectionFromClipboard())} type="button">
                粘贴到当前选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCutSelection)} type="button">
                剪切选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onClearSelection)} type="button">
                清空选区
              </button>
              {canInsertCopiedCellsDown && selectedCell ? (
                <button
                  className="sheet-context-menu-item"
                  onClick={() => runContextMenuAction(() => onInsertCopiedCellsDown(selectedCell.rowIndex, selectedCell.columnIndex))}
                  type="button"
                >
                  从当前单元格向下插入复制内容
                </button>
              ) : null}
              <button
                className="sheet-context-menu-item"
                onClick={() => runContextMenuAction(() => {
                  onFreezeRows(0);
                  onFreezeColumns(0);
                })}
                type="button"
              >
                取消全部冻结
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
