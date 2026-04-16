import { useEffect, useMemo, useState, type MouseEvent } from "react";

import type { WorkspaceTreeWorkbook } from "../types/desktopApp";

type ActiveSheetHeaderState = {
  sheetName: string;
  workbookName: string;
  columnCount: number;
  rowCount: number;
  saveStatusText: string;
  freezeStatusText: string;
  selectionStatusText: string;
  dirtyTabCount: number;
};

type EditorWorkspaceHeaderProps = {
  focusedWorkbook: WorkspaceTreeWorkbook | null;
  activeTabId: string | null;
  canCreateSheet: boolean;
  onCreateSheet: (workbookName: string) => void;
  onOpenSheet: (workbookName: string, sheetName: string) => void;
  onOpenSheetContextMenu: (event: MouseEvent<HTMLButtonElement>, workbookName: string, sheetName: string) => void;
  activeSheet: ActiveSheetHeaderState | null;
  canSaveActiveWorkbook: boolean;
  canUndoActiveSheet: boolean;
  canRedoActiveSheet: boolean;
  canEditActiveSheet: boolean;
  onSaveActiveWorkbook: () => void;
  onUndoActiveSheetEdit: () => void;
  onRedoActiveSheetEdit: () => void;
  onAppendRow: () => void;
  onAppendColumn: () => void;
  onOpenFreezeDialog: () => void;
  sheetFilter: string;
  onSheetFilterChange: (value: string) => void;
};

export function EditorWorkspaceHeader({
  focusedWorkbook,
  activeTabId,
  canCreateSheet,
  onCreateSheet,
  onOpenSheet,
  onOpenSheetContextMenu,
  activeSheet,
  canSaveActiveWorkbook,
  canUndoActiveSheet,
  canRedoActiveSheet,
  canEditActiveSheet,
  onSaveActiveWorkbook,
  onUndoActiveSheetEdit,
  onRedoActiveSheetEdit,
  onAppendRow,
  onAppendColumn,
  onOpenFreezeDialog,
  sheetFilter,
  onSheetFilterChange,
}: EditorWorkspaceHeaderProps) {
  const [workbookSheetSearch, setWorkbookSheetSearch] = useState("");

  useEffect(() => {
    setWorkbookSheetSearch("");
  }, [focusedWorkbook?.name]);

  const filteredSheets = useMemo(() => {
    if (!focusedWorkbook) {
      return [];
    }

    const search = workbookSheetSearch.trim().toLocaleLowerCase();
    if (!search) {
      return focusedWorkbook.sheets;
    }

    return focusedWorkbook.sheets.filter((sheet) => {
      const displayName = sheet.alias ?? sheet.sheetName;
      return (
        displayName.toLocaleLowerCase().includes(search) ||
        sheet.sheetName.toLocaleLowerCase().includes(search)
      );
    });
  }, [focusedWorkbook, workbookSheetSearch]);

  return (
    <div className="editor-workspace-header">
      {focusedWorkbook ? (
        <section className="sheet-selector-panel compact-sheet-selector-panel">
          <div className="compact-sheet-selector-header">
            <p className="eyebrow">工作簿 / {focusedWorkbook.alias ?? focusedWorkbook.name}</p>
            <div className="compact-sheet-selector-toolbar">
              <label className="search-field compact-field compact-sheet-selector-search">
                <span>筛选表格</span>
                <input
                  onChange={(event) => setWorkbookSheetSearch(event.target.value)}
                  placeholder="按表格名搜索"
                  type="text"
                  value={workbookSheetSearch}
                />
              </label>
              <button
                className="secondary-button compact-sheet-selector-action"
                disabled={!canCreateSheet}
                onClick={() => onCreateSheet(focusedWorkbook.name)}
                type="button"
              >
                新建表格
              </button>
            </div>
          </div>

          {focusedWorkbook.sheets.length === 0 ? (
            <div className="table-empty-panel">
              <strong>当前工作簿还没有表格</strong>
              <p>可以从文件菜单或工作簿右键菜单新建表格。</p>
            </div>
          ) : filteredSheets.length === 0 ? (
            <div className="table-empty-panel">
              <strong>没有匹配的表格</strong>
              <p>试试更短的关键词，或者搜索原始表名与别名。</p>
            </div>
          ) : (
            <>
              <p className="sheet-selector-meta">
                显示 {filteredSheets.length} / {focusedWorkbook.sheets.length} 个表格
              </p>
              <div className="sheet-selector-grid">
                {filteredSheets.map((sheet) => {
                  const tabId = `${sheet.workbookName}::${sheet.sheetName}`;
                  const isActive = activeTabId === tabId;

                  return (
                    <button
                      className={`sheet-selector-button${isActive ? " is-active" : ""}`}
                      key={tabId}
                      onClick={() => onOpenSheet(sheet.workbookName, sheet.sheetName)}
                      onContextMenu={(event) => onOpenSheetContextMenu(event, sheet.workbookName, sheet.sheetName)}
                      type="button"
                    >
                      <div className="sheet-selector-name">
                        <div className="sheet-selector-label">{sheet.alias ?? sheet.sheetName}</div>
                        {sheet.alias ? <small className="sheet-selector-alias">{sheet.sheetName}</small> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : null}

      {activeSheet ? (
        <section className="editor-status-bar" aria-label="当前表格状态">
          <div className="editor-status-primary">
            <strong>{activeSheet.sheetName}</strong>
            <span>{activeSheet.workbookName}</span>
            <span>{activeSheet.columnCount} 列</span>
            <span>{activeSheet.rowCount} 行</span>
            <span>{activeSheet.dirtyTabCount} 个未保存标签</span>
          </div>

          <div className="editor-status-actions">
            <button
              className="secondary-button compact-action-button"
              disabled={!canSaveActiveWorkbook}
              onClick={onSaveActiveWorkbook}
              type="button"
            >
              保存
            </button>
            <button
              className="secondary-button compact-action-button"
              disabled={!canUndoActiveSheet}
              onClick={onUndoActiveSheetEdit}
              type="button"
            >
              撤销
            </button>
            <button
              className="secondary-button compact-action-button"
              disabled={!canRedoActiveSheet}
              onClick={onRedoActiveSheetEdit}
              type="button"
            >
              重做
            </button>
            <button
              className="secondary-button compact-action-button"
              disabled={!canEditActiveSheet}
              onClick={onAppendRow}
              type="button"
            >
              添加行
            </button>
            <button
              className="secondary-button compact-action-button"
              disabled={!canEditActiveSheet}
              onClick={onAppendColumn}
              type="button"
            >
              添加列
            </button>
            <button
              className="secondary-button compact-action-button"
              disabled={!canEditActiveSheet}
              onClick={onOpenFreezeDialog}
              type="button"
            >
              冻结
            </button>
          </div>

          <label className="search-field sheet-filter-field compact-field editor-status-filter">
            <span>筛选当前表格</span>
            <input
              onChange={(event) => onSheetFilterChange(event.target.value)}
              placeholder="按任意单元格文本过滤"
              type="text"
              value={sheetFilter}
            />
          </label>

          <div className="editor-status-chips">
            <span>保存: {activeSheet.saveStatusText}</span>
            <span>冻结: {activeSheet.freezeStatusText}</span>
            <span>选区: {activeSheet.selectionStatusText}</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}