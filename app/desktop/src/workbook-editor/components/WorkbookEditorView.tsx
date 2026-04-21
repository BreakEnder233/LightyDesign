import { useMemo, type MouseEvent } from "react";

import { ColumnEditorDialog } from "./ColumnEditorDialog";
import { EditorWorkspaceHeader, type ActiveSheetHeaderState } from "./EditorWorkspaceHeader";
import { VirtualSheetTable } from "./VirtualSheetTable";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

import type {
  HeaderPropertySchema,
  SheetColumn,
  SheetLoadState,
  SheetResponse,
  SheetSelection,
  SheetSelectionRange,
  SheetTab,
  TypeMetadataResponse,
  TypeValidationResponse,
  ValidationRuleValidationResponse,
  ValidationSchemaResolveResponse,
  WorkspaceTreeWorkbook,
} from "../types/desktopApp";

type WorkbookEditorViewProps = {
  focusedWorkbookName: string | null;
  workspaceStatus: "idle" | "loading" | "ready" | "error";
  workbookTree: WorkspaceTreeWorkbook[];
  workspaceError: string | null;
  workspaceSearch: string;
  onWorkspaceSearchChange: (value: string) => void;
  onCreateWorkbook: () => void;
  onFocusWorkbook: (workbookName: string) => void;
  onOpenWorkbookContextMenu: (event: MouseEvent<HTMLButtonElement>, workbookName: string) => void;
  onRetryWorkspaceLoad: () => void;
  activeTab: SheetTab | null;
  activeTabId: string | null;
  activeSheetState: SheetLoadState | undefined;
  activeSheetData: SheetResponse | null;
  activeSheetColumns: SheetColumn[];
  activeSheetRows: string[][];
  activeWorkbookDirtyTabCount: number;
  saveStatusText: string;
  freezeStatusText: string;
  selectionStatusText: string;
  canCreateSheet: boolean;
  canEditActiveSheet: boolean;
  canRedoActiveSheet: boolean;
  canSaveActiveWorkbook: boolean;
  canUndoActiveSheet: boolean;
  focusedWorkbook: WorkspaceTreeWorkbook | null;
  onAppendColumn: () => void;
  onAppendRow: () => void;
  onCreateSheet: (workbookName: string) => void;
  onOpenFreezeDialog: () => void;
  onOpenSheet: (workbookName: string, sheetName: string) => void;
  onOpenSheetContextMenu: (event: MouseEvent<HTMLButtonElement>, workbookName: string, sheetName: string) => void;
  onRedoActiveSheetEdit: () => void;
  onSaveActiveWorkbook: () => void;
  onSheetFilterChange: (value: string) => void;
  onUndoActiveSheetEdit: () => void;
  sheetFilter: string;
  onRetryActiveSheetLoad: () => void;
  selectedCell: SheetSelection | null;
  selectedCellCount: number;
  selectedCellAddress: string;
  selectedCellValue: string;
  selectedCellDescription: string;
  onFormulaBarChange: (nextValue: string) => void;
  canInsertCopiedCellsDown: boolean;
  canInsertCopiedColumns: boolean;
  canInsertCopiedRows: boolean;
  columnWidths: number[];
  appliedFreezeColumnCount: number;
  appliedFreezeRowCount: number;
  onSheetScrollSnapshotChange: (snapshot: { scrollLeft: number; scrollTop: number }) => void;
  onAutoSizeColumn: (columnIndex: number) => void;
  onCopySelection: () => string;
  onCopySelectionToClipboard: () => void;
  onCutSelection: () => void;
  onClearSelection: () => void;
  onEditCell: (rowIndex: number, columnIndex: number, nextValue: string) => void;
  onFreezeColumns: (columnCount: number) => void;
  onFreezeRows: (rowCount: number) => void;
  onAutoFillSelection: (targetRowIndex: number, targetColumnIndex: number) => void;
  onInsertColumn: (afterColumnIndex: number) => void;
  onInsertCopiedCellsDown: (rowIndex: number, columnIndex: number) => void;
  onInsertCopiedColumnsAfter: (columnIndex: number) => void;
  onInsertCopiedColumnsBefore: (columnIndex: number) => void;
  onInsertCopiedRowsAbove: (rowIndex: number) => void;
  onInsertCopiedRowsBelow: (rowIndex: number) => void;
  onInsertColumnBefore: (columnIndex: number) => void;
  onInsertRow: (afterRowIndex: number) => void;
  onInsertRowAbove: (rowIndex: number) => void;
  onPasteSelection: (rowIndex: number, columnIndex: number, clipboardText: string) => void;
  onPasteSelectionFromClipboard: (rowIndex: number, columnIndex: number) => void;
  onPasteIntoCurrentSelectionFromClipboard: () => void;
  onResizeColumn: (columnIndex: number, nextWidth: number) => void;
  onDeleteColumn: (columnIndex: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onSelectCell: (rowIndex: number, columnIndex: number, options?: { extendSelection?: boolean }) => void;
  onSelectColumn: (columnIndex: number, options?: { extendSelection?: boolean }) => void;
  onSelectAll: () => void;
  onSelectRow: (rowIndex: number, options?: { extendSelection?: boolean }) => void;
  filteredRowEntries: Array<{ row: string[]; rowIndex: number }>;
  restoreScrollRequest:
    | {
        key: number;
        scrollLeft: number;
        scrollTop: number;
      }
    | null;
  selectionRange: SheetSelectionRange | null;
  editingColumn: SheetColumn | null;
  editingColumnIndex: number | null;
  onCloseColumnEditor: () => void;
  onResolveValidationSchema: (type: string) => Promise<ValidationSchemaResolveResponse>;
  onSaveColumnDefinition: (columnIndex: number, nextColumn: SheetColumn) => void;
  onValidateColumnType: (type: string) => Promise<TypeValidationResponse>;
  onValidateColumnValidationRule: (type: string, validation: unknown) => Promise<ValidationRuleValidationResponse>;
  propertySchemas: HeaderPropertySchema[];
  typeMetadata: TypeMetadataResponse | null;
  onOpenColumnEditor: (columnIndex: number) => void;
};

export function WorkbookEditorView({
  focusedWorkbookName,
  workspaceStatus,
  workbookTree,
  workspaceError,
  workspaceSearch,
  onWorkspaceSearchChange,
  onCreateWorkbook,
  onFocusWorkbook,
  onOpenWorkbookContextMenu,
  onRetryWorkspaceLoad,
  activeTab,
  activeTabId,
  activeSheetState,
  activeSheetData,
  activeSheetColumns,
  activeSheetRows,
  activeWorkbookDirtyTabCount,
  saveStatusText,
  freezeStatusText,
  selectionStatusText,
  canCreateSheet,
  canEditActiveSheet,
  canRedoActiveSheet,
  canSaveActiveWorkbook,
  canUndoActiveSheet,
  focusedWorkbook,
  onAppendColumn,
  onAppendRow,
  onCreateSheet,
  onOpenFreezeDialog,
  onOpenSheet,
  onOpenSheetContextMenu,
  onRedoActiveSheetEdit,
  onSaveActiveWorkbook,
  onSheetFilterChange,
  onUndoActiveSheetEdit,
  sheetFilter,
  onRetryActiveSheetLoad,
  selectedCell,
  selectedCellCount,
  selectedCellAddress,
  selectedCellValue,
  selectedCellDescription,
  onFormulaBarChange,
  canInsertCopiedCellsDown,
  canInsertCopiedColumns,
  canInsertCopiedRows,
  columnWidths,
  appliedFreezeColumnCount,
  appliedFreezeRowCount,
  onSheetScrollSnapshotChange,
  onAutoSizeColumn,
  onCopySelection,
  onCopySelectionToClipboard,
  onCutSelection,
  onClearSelection,
  onEditCell,
  onFreezeColumns,
  onFreezeRows,
  onAutoFillSelection,
  onInsertColumn,
  onInsertCopiedCellsDown,
  onInsertCopiedColumnsAfter,
  onInsertCopiedColumnsBefore,
  onInsertCopiedRowsAbove,
  onInsertCopiedRowsBelow,
  onInsertColumnBefore,
  onInsertRow,
  onInsertRowAbove,
  onPasteSelection,
  onPasteSelectionFromClipboard,
  onPasteIntoCurrentSelectionFromClipboard,
  onResizeColumn,
  onDeleteColumn,
  onDeleteRow,
  onSelectCell,
  onSelectColumn,
  onSelectAll,
  onSelectRow,
  filteredRowEntries,
  restoreScrollRequest,
  selectionRange,
  editingColumn,
  editingColumnIndex,
  onCloseColumnEditor,
  onResolveValidationSchema,
  onSaveColumnDefinition,
  onValidateColumnType,
  onValidateColumnValidationRule,
  propertySchemas,
  typeMetadata,
  onOpenColumnEditor,
}: WorkbookEditorViewProps) {
  const activeSheetHeaderState = useMemo<ActiveSheetHeaderState | null>(() => {
    if (!activeTab || !activeSheetData) {
      return null;
    }

    const workbook = workbookTree.find((entry) => entry.name === activeTab.workbookName);
    const sheetAlias = workbook?.sheets.find((sheet) => sheet.sheetName === activeTab.sheetName)?.alias;

    return {
      sheetName: sheetAlias ?? activeSheetData.metadata.name,
      workbookName: workbook?.alias ?? activeTab.workbookName,
      columnCount: activeSheetColumns.length,
      rowCount: activeSheetRows.length,
      saveStatusText,
      freezeStatusText,
      selectionStatusText,
      dirtyTabCount: activeWorkbookDirtyTabCount,
    };
  }, [
    activeSheetColumns.length,
    activeSheetData,
    activeSheetRows.length,
    activeTab,
    activeWorkbookDirtyTabCount,
    freezeStatusText,
    saveStatusText,
    selectionStatusText,
    workbookTree,
  ]);

  return (
    <>
      <WorkspaceSidebar
        focusedWorkbookName={focusedWorkbookName}
        onCreateWorkbook={onCreateWorkbook}
        onFocusWorkbook={onFocusWorkbook}
        onOpenWorkbookContextMenu={onOpenWorkbookContextMenu}
        onRetryWorkspaceLoad={onRetryWorkspaceLoad}
        onWorkspaceSearchChange={onWorkspaceSearchChange}
        workbookTree={workbookTree}
        workspaceError={workspaceError}
        workspaceSearch={workspaceSearch}
        workspaceStatus={workspaceStatus}
      />

      <main className="workspace-main">
        <section className="editor-panel">
          <EditorWorkspaceHeader
            activeSheet={activeSheetHeaderState}
            activeTabId={activeTabId}
            canCreateSheet={canCreateSheet}
            canEditActiveSheet={canEditActiveSheet}
            canRedoActiveSheet={canRedoActiveSheet}
            canSaveActiveWorkbook={canSaveActiveWorkbook}
            canUndoActiveSheet={canUndoActiveSheet}
            focusedWorkbook={focusedWorkbook}
            onAppendColumn={onAppendColumn}
            onAppendRow={onAppendRow}
            onCreateSheet={onCreateSheet}
            onOpenFreezeDialog={onOpenFreezeDialog}
            onOpenSheet={onOpenSheet}
            onOpenSheetContextMenu={onOpenSheetContextMenu}
            onRedoActiveSheetEdit={onRedoActiveSheetEdit}
            onSaveActiveWorkbook={onSaveActiveWorkbook}
            onSheetFilterChange={onSheetFilterChange}
            onUndoActiveSheetEdit={onUndoActiveSheetEdit}
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
                <button className="secondary-button" onClick={onRetryActiveSheetLoad} type="button">
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
                      onChange={(event) => onFormulaBarChange(event.target.value)}
                      placeholder="选择单元格后可直接编辑内容"
                      rows={2}
                      value={selectedCellValue}
                    />
                    <span className="sheet-formula-meta">{selectedCellDescription}</span>
                  </div>
                </div>

                <VirtualSheetTable
                  canInsertCopiedCellsDown={canInsertCopiedCellsDown}
                  canInsertCopiedColumns={canInsertCopiedColumns}
                  canInsertCopiedRows={canInsertCopiedRows}
                  columns={activeSheetColumns}
                  columnWidths={columnWidths}
                  editedCells={activeSheetState.editedCells ?? {}}
                  onEditColumn={onOpenColumnEditor}
                  freezeColumns={appliedFreezeColumnCount}
                  freezeRows={appliedFreezeRowCount}
                  onScrollSnapshotChange={onSheetScrollSnapshotChange}
                  onAutoSizeColumn={onAutoSizeColumn}
                  onCopySelection={onCopySelection}
                  onCopySelectionToClipboard={onCopySelectionToClipboard}
                  onCutSelection={onCutSelection}
                  onClearSelection={onClearSelection}
                  onEditCell={onEditCell}
                  onFreezeColumns={onFreezeColumns}
                  onFreezeRows={onFreezeRows}
                  onAutoFillSelection={onAutoFillSelection}
                  onInsertColumn={onInsertColumn}
                  onInsertCopiedCellsDown={onInsertCopiedCellsDown}
                  onInsertCopiedColumnsAfter={onInsertCopiedColumnsAfter}
                  onInsertCopiedColumnsBefore={onInsertCopiedColumnsBefore}
                  onInsertCopiedRowsAbove={onInsertCopiedRowsAbove}
                  onInsertCopiedRowsBelow={onInsertCopiedRowsBelow}
                  onInsertColumnBefore={onInsertColumnBefore}
                  onInsertRow={onInsertRow}
                  onInsertRowAbove={onInsertRowAbove}
                  onPasteSelection={onPasteSelection}
                  onPasteSelectionFromClipboard={onPasteSelectionFromClipboard}
                  onPasteIntoCurrentSelectionFromClipboard={onPasteIntoCurrentSelectionFromClipboard}
                  onResizeColumn={onResizeColumn}
                  onDeleteColumn={onDeleteColumn}
                  onDeleteRow={onDeleteRow}
                  onSelectCell={onSelectCell}
                  onSelectColumn={onSelectColumn}
                  onSelectAll={onSelectAll}
                  onSelectRow={onSelectRow}
                  rows={filteredRowEntries}
                  restoreScrollRequest={restoreScrollRequest}
                  selectedCell={selectedCell}
                  selectionRange={selectionRange}
                />
              </>
            ) : null}

            <ColumnEditorDialog
              column={editingColumn}
              columnIndex={editingColumnIndex}
              isOpen={editingColumnIndex !== null}
              onClose={onCloseColumnEditor}
              onResolveValidationSchema={onResolveValidationSchema}
              onSave={onSaveColumnDefinition}
              onValidateType={onValidateColumnType}
              onValidateValidationRule={onValidateColumnValidationRule}
              propertySchemas={propertySchemas}
              typeMetadata={typeMetadata}
            />
          </div>
        </section>
      </main>
    </>
  );
}