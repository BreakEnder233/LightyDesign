import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { buildCellKey, getColumnEditorKind, type SheetColumn } from "../types/desktopApp";

type VirtualSheetTableProps = {
  columns: SheetColumn[];
  rows: Array<{
    row: string[];
    rowIndex: number;
  }>;
  editedCells: Record<string, string>;
  onEditCell: (rowIndex: number, columnIndex: number, nextValue: string) => void;
};

const rowHeight = 42;
const overscanCount = 12;

export function VirtualSheetTable({ columns, rows, editedCells, onEditCell }: VirtualSheetTableProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const gridTemplateColumns = useMemo(
    () => `72px repeat(${columns.length}, minmax(180px, 1fr))`,
    [columns.length],
  );
  const minTableWidth = `${72 + columns.length * 180}px`;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: overscanCount,
  });

  function syncHeaderScroll() {
    if (!bodyRef.current || !headerRef.current) {
      return;
    }

    headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
  }

  if (rows.length === 0) {
    return <div className="table-empty-panel">没有匹配当前筛选条件的数据。</div>;
  }

  return (
    <div className="virtual-table-shell">
      <div className="virtual-table-header-scroll" ref={headerRef}>
        <div className="virtual-table-header" style={{ gridTemplateColumns, minWidth: minTableWidth }}>
          <div className="virtual-header-cell row-number-cell is-header">#</div>
          {columns.map((column) => (
            <div className="virtual-header-cell" key={column.fieldName}>
              <div>{column.displayName || column.fieldName}</div>
              <small>{column.type}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="virtual-table-body-scroll" onScroll={syncHeaderScroll} ref={bodyRef}>
        <div className="virtual-table-canvas" style={{ height: rowVirtualizer.getTotalSize(), minWidth: minTableWidth }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowEntry = rows[virtualRow.index];
            const visualRowNumber = rowEntry.rowIndex + 1;

            return (
              <div
                className="virtual-table-row"
                key={visualRowNumber}
                style={{
                  gridTemplateColumns,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="virtual-row-number row-number-cell">{visualRowNumber}</div>
                {columns.map((column, columnIndex) => {
                  const cellKey = buildCellKey(rowEntry.rowIndex, columnIndex);
                  const isDirty = Object.prototype.hasOwnProperty.call(editedCells, cellKey);
                  const editorKind = getColumnEditorKind(column);
                  const cellValue = rowEntry.row[columnIndex] ?? "";

                  return (
                    <label className={`virtual-cell is-${editorKind}${isDirty ? " is-dirty" : ""}`} key={`${column.fieldName}-${visualRowNumber}`}>
                      {editorKind === "boolean" ? (
                        <select
                          className="virtual-cell-input virtual-cell-select"
                          onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
                          value={cellValue}
                        >
                          <option value="">(empty)</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          className={`virtual-cell-input${editorKind === "reference" || editorKind === "list" ? " is-code" : ""}`}
                          inputMode={editorKind === "number" ? "decimal" : "text"}
                          onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
                          placeholder={
                            editorKind === "reference"
                              ? "[[id]]"
                              : editorKind === "list"
                                ? "逗号分隔值"
                                : undefined
                          }
                          spellCheck={editorKind === "reference" || editorKind === "list" ? false : true}
                          type="text"
                          value={cellValue}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}