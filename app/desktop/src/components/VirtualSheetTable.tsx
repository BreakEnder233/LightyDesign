import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildCellKey,
  getColumnEditorKind,
  getSelectionBounds,
  type SheetColumn,
  type SheetSelection,
  type SheetSelectionRange,
} from "../types/desktopApp";

type VirtualSheetTableProps = {
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
  onResizeColumn: (columnIndex: number, nextWidth: number) => void;
  onAutoSizeColumn: (columnIndex: number) => void;
  onFreezeRows: (rowCount: number) => void;
  onFreezeColumns: (columnCount: number) => void;
  onInsertRowAbove: (rowIndex: number) => void;
  onInsertRow: (afterRowIndex: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onInsertColumnBefore: (columnIndex: number) => void;
  onInsertColumn: (afterColumnIndex: number) => void;
  onDeleteColumn: (columnIndex: number) => void;
  onCopySelection: () => string;
  onCopySelectionToClipboard: () => void;
  onCutSelection: () => void;
  onClearSelection: () => void;
  onPasteSelection: (rowIndex: number, columnIndex: number, clipboardText: string) => void;
  onEditCell: (rowIndex: number, columnIndex: number, nextValue: string) => void;
};

const rowHeight = 34;
const overscanCount = 12;
const rowNumberWidth = 56;

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
    };

function isImeKeyboardEvent(event: React.KeyboardEvent<HTMLElement>) {
  return event.nativeEvent.isComposing || event.key === "Process" || event.nativeEvent.keyCode === 229;
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

export function VirtualSheetTable({
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
  onResizeColumn,
  onAutoSizeColumn,
  onFreezeRows,
  onFreezeColumns,
  onInsertRowAbove,
  onInsertRow,
  onDeleteRow,
  onInsertColumnBefore,
  onInsertColumn,
  onDeleteColumn,
  onCopySelection,
  onCopySelectionToClipboard,
  onCutSelection,
  onClearSelection,
  onPasteSelection,
  onEditCell,
}: VirtualSheetTableProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const frozenTopRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement | HTMLSelectElement>());
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const isPointerSelectingRef = useRef(false);
  const resizeStateRef = useRef<{ columnIndex: number; startX: number; startWidth: number } | null>(null);
  const editFocusModeRef = useRef<"select-all" | "caret-end">("select-all");
  const [contextMenuState, setContextMenuState] = useState<HeaderContextMenuState | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);

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
  const selectionBounds = selectionRange ? getSelectionBounds(selectionRange) : null;
  const rowVirtualizer = useVirtualizer({
    count: scrollRows.length,
    getScrollElement: () => bodyRef.current ?? leftBodyRef.current,
    estimateSize: () => rowHeight,
    overscan: overscanCount,
  });

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

  function syncVertical(scrollTop: number) {
    if (leftBodyRef.current && leftBodyRef.current.scrollTop !== scrollTop) {
      leftBodyRef.current.scrollTop = scrollTop;
    }
  }

  useEffect(() => {
    if (!selectedCell) {
      return;
    }

    const visibleRowIndex = rows.findIndex((row) => row.rowIndex === selectedCell.rowIndex);
    if (visibleRowIndex >= safeFreezeRows) {
      rowVirtualizer.scrollToIndex(visibleRowIndex - safeFreezeRows, { align: "auto" });
    }

    const frameId = window.requestAnimationFrame(() => {
      const targetElement = selectedCellKey
        ? (editingCellKey === selectedCellKey
          ? inputRefs.current.get(selectedCellKey)
          : cellRefs.current.get(selectedCellKey))
        : null;
      if (!targetElement) {
        return;
      }

      targetElement.focus();
      if (targetElement instanceof HTMLInputElement) {
        if (editFocusModeRef.current === "select-all") {
          targetElement.select();
        } else {
          const nextLength = targetElement.value.length;
          targetElement.setSelectionRange(nextLength, nextLength);
        }
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [editingCellKey, rowVirtualizer, rows, safeFreezeRows, selectedCell, selectedCellKey]);

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
    };

    const handlePointerMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) {
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
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handleWindowMouseDown);
    };
  }, [onResizeColumn]);

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

  function startEditingCell(rowIndex: number, columnIndex: number, focusMode: "select-all" | "caret-end" = "select-all") {
    const cellKey = buildCellKey(rowIndex, columnIndex);
    editFocusModeRef.current = focusMode;
    onSelectCell(rowIndex, columnIndex);
    setEditingCellKey(cellKey);
  }

  function stopEditingCell() {
    setEditingCellKey(null);
  }

  function handleCellKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
  ) {
    const currentTarget = event.currentTarget;

    if (currentTarget instanceof HTMLInputElement && isImeKeyboardEvent(event)) {
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
    if (editorKind !== "boolean" && isImeKeyboardEvent(event)) {
      startEditingCell(rowIndex, columnIndex);
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEditingCell(rowIndex, columnIndex);
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

    if (
      editorKind !== "boolean" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.nativeEvent.isComposing &&
      event.key.length === 1
    ) {
      event.preventDefault();
      onEditCell(rowIndex, columnIndex, event.key);
      startEditingCell(rowIndex, columnIndex, "caret-end");
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

  function renderHeaderCells(columnSubset: SheetColumn[], columnOffset: number) {
    return columnSubset.map((column, offset) => {
      const columnIndex = columnOffset + offset;
      const isSelectedColumn = selectedCell?.columnIndex === columnIndex;
      const isInRangeColumn = Boolean(
        selectionBounds &&
        columnIndex >= selectionBounds.startColumnIndex &&
        columnIndex <= selectionBounds.endColumnIndex,
      );

      return (
        <div
          className={`virtual-header-cell is-actionable${isSelectedColumn ? " is-selected-column" : ""}${isInRangeColumn ? " is-in-range-column" : ""}`}
          key={column.fieldName}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            onSelectColumn(columnIndex, { extendSelection: event.shiftKey });
          }}
          onContextMenu={(event) => {
            onSelectColumn(columnIndex, { extendSelection: event.shiftKey });
            openContextMenu(event, {
              kind: "column",
              columnIndex,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          <div className="virtual-header-label">{column.displayName || column.fieldName}</div>
          <small>{column.type}</small>
          <button
            aria-label={`调整列宽 ${column.displayName || column.fieldName}`}
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
    const isEditing = editingCellKey === cellKey;

    return (
      <div
        className={`virtual-cell is-${editorKind}${isDirty ? " is-dirty" : ""}${isSelected ? " is-selected" : ""}${isInRange ? " is-in-range" : ""}`}
        key={`${column.fieldName}-${rowEntry.rowIndex}`}
        onCompositionStart={() => {
          if (!isEditing && editorKind !== "boolean") {
            startEditingCell(rowEntry.rowIndex, columnIndex);
          }
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          isPointerSelectingRef.current = true;
          onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: event.shiftKey });
        }}
        onDoubleClick={() => startEditingCell(rowEntry.rowIndex, columnIndex)}
        onMouseEnter={() => {
          if (!isPointerSelectingRef.current) {
            return;
          }

          onSelectCell(rowEntry.rowIndex, columnIndex, { extendSelection: true });
        }}
        ref={(element) => registerCellRef(cellKey, element)}
        role="gridcell"
        tabIndex={isSelected && !isEditing ? 0 : -1}
        onKeyDown={(event) => handleCellShellKeyDown(event, rowEntry.rowIndex, columnIndex, editorKind)}
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
              if (!isSelected) {
                onSelectCell(rowEntry.rowIndex, columnIndex);
              }
            }}
            onBlur={stopEditingCell}
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
              if (!isSelected) {
                onSelectCell(rowEntry.rowIndex, columnIndex);
              }
            }}
            onBlur={stopEditingCell}
            onKeyDown={(event) => handleCellKeyDown(event, rowEntry.rowIndex, columnIndex)}
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
            onSelectRow(rowEntry.rowIndex, { extendSelection: event.shiftKey });
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

  if (rows.length === 0) {
    return <div className="table-empty-panel">没有匹配当前筛选条件的数据。</div>;
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
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft, "header")}
        ref={headerRef}
      >
        <div className="virtual-table-header" style={{ gridTemplateColumns: rightGridTemplateColumns, width: rightPaneWidth }}>
          {renderHeaderCells(scrollColumns, safeFreezeColumns)}
        </div>
      </div>

      <div className={`virtual-pane virtual-pane-frozen-left${safeFreezeRows === 0 ? " is-hidden" : ""}`}>
        <div className="virtual-table-static" style={{ width: leftPaneWidth }}>
          {frozenRows.map((rowEntry) => renderLeftRow(rowEntry))}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-frozen-top-scroll${safeFreezeRows === 0 || scrollColumns.length === 0 ? " is-hidden" : ""}`}
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft, "frozen")}
        ref={frozenTopRef}
      >
        <div className="virtual-table-static" style={{ width: rightPaneWidth }}>
          {frozenRows.map((rowEntry) => renderRightRow(rowEntry))}
        </div>
      </div>

      <div
        className={`virtual-pane virtual-pane-left-body${scrollColumns.length === 0 ? " is-scroll-host" : ""}`}
        onScroll={
          scrollColumns.length === 0
            ? (event) => syncVertical(event.currentTarget.scrollTop)
            : undefined
        }
        ref={leftBodyRef}
      >
        <div className="virtual-table-canvas" style={{ height: rowVirtualizer.getTotalSize(), width: leftPaneWidth }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
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
        }}
        ref={bodyRef}
      >
        <div className="virtual-table-canvas" style={{ height: rowVirtualizer.getTotalSize(), width: rightPaneWidth }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
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

      {contextMenuState ? (
        <div
          className="sheet-context-menu"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: contextMenuState.x, top: contextMenuState.y }}
        >
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
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(() => onDeleteColumn(contextMenuState.columnIndex))} type="button">
                删除当前列
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
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onCutSelection)} type="button">
                剪切选区
              </button>
              <button className="sheet-context-menu-item" onClick={() => runContextMenuAction(onClearSelection)} type="button">
                清空选区
              </button>
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
