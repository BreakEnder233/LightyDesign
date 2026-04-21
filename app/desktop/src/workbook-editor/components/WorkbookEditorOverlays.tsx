import type { ReactNode, RefObject } from "react";

import { NameInputDialog } from "../../components/NameInputDialog";

import { CodegenDialog } from "./CodegenDialog";
import { FreezeDialog } from "./FreezeDialog";

type WorkbookContextMenuState = {
  workbookName: string;
  x: number;
  y: number;
};

type SheetContextMenuState = {
  workbookName: string;
  sheetName: string;
  x: number;
  y: number;
};

type CodegenDialogMode = "single" | "all";

type WorkbookEditorOverlaysProps = {
  isCreateWorkbookDialogOpen: boolean;
  newWorkbookName: string;
  workspacePath: string;
  onCreateWorkbookNameChange: (value: string) => void;
  onCloseCreateWorkbookDialog: () => void;
  onConfirmCreateWorkbook: () => void | Promise<void>;
  isEditWorkbookAliasDialogOpen: boolean;
  editWorkbookAliasTarget: string | null;
  editWorkbookAliasValue: string;
  onEditWorkbookAliasValueChange: (value: string) => void;
  onCloseEditWorkbookAliasDialog: () => void;
  onConfirmEditWorkbookAlias: () => void | Promise<void>;
  isCreateSheetDialogOpen: boolean;
  sheetDialogWorkbookName: string | null;
  newSheetName: string;
  onCreateSheetNameChange: (value: string) => void;
  onCloseCreateSheetDialog: () => void;
  onConfirmCreateSheet: () => void | Promise<void>;
  isEditSheetAliasDialogOpen: boolean;
  editSheetAliasTarget: { workbookName: string; sheetName: string } | null;
  editSheetAliasValue: string;
  onEditSheetAliasValueChange: (value: string) => void;
  onCloseEditSheetAliasDialog: () => void;
  onConfirmEditSheetAlias: () => void | Promise<void>;
  isRenameSheetDialogOpen: boolean;
  renameSheetTarget: { workbookName: string; sheetName: string } | null;
  renameSheetName: string;
  renameSheetInputRef: RefObject<HTMLInputElement | null>;
  onRenameSheetNameChange: (value: string) => void;
  onCloseRenameSheetDialog: () => void;
  onConfirmRenameSheet: () => void | Promise<void>;
  bridgeError: string | null;
  canChooseWorkspaceDirectory: boolean;
  codegenOutputInputRef: RefObject<HTMLInputElement | null>;
  isCodegenDialogOpen: boolean;
  codegenDialogMode: CodegenDialogMode;
  onChooseCodegenOutputDirectory: () => void | Promise<void>;
  onCloseCodegenDialog: () => void;
  onConfirmExportAllWorkbookCode: () => void | Promise<void>;
  onExportWorkbookCode: () => void | Promise<void>;
  onCodegenOutputPathChange: (value: string) => void;
  onSaveWorkspaceCodegenConfig: () => void | Promise<void>;
  codegenOutputRelativePath: string;
  activeSheetLabel: string;
  freezeColumnCount: number;
  freezeRowCount: number;
  isFreezeDialogOpen: boolean;
  onCloseFreezeDialog: () => void;
  onConfirmFreezeDialog: () => void;
  onFreezeColumnCountChange: (value: number) => void;
  onFreezeRowCountChange: (value: number) => void;
  onResetFreezeDialog: () => void;
  visibleColumnCount: number;
  visibleRowCount: number;
  workbookContextMenu: WorkbookContextMenuState | null;
  workbookContextMenuRef: RefObject<HTMLDivElement | null>;
  onOpenCreateSheetDialog: (workbookName: string) => void;
  onOpenEditWorkbookAliasDialog: (workbookName: string) => void;
  onConvertWorkbookCode: (workbookName: string) => void;
  onCloseWorkbookContextMenu: () => void;
  onDeleteWorkbook: (workbookName: string) => void | Promise<void>;
  sheetContextMenu: SheetContextMenuState | null;
  sheetContextMenuRef: RefObject<HTMLDivElement | null>;
  onOpenRenameSheetDialog: (workbookName: string, sheetName: string) => void;
  onOpenEditSheetAliasDialog: (workbookName: string, sheetName: string) => void;
  onDeleteSheet: (workbookName: string, sheetName: string) => void | Promise<void>;
};

export function WorkbookEditorOverlays({
  isCreateWorkbookDialogOpen,
  newWorkbookName,
  workspacePath,
  onCreateWorkbookNameChange,
  onCloseCreateWorkbookDialog,
  onConfirmCreateWorkbook,
  isEditWorkbookAliasDialogOpen,
  editWorkbookAliasTarget,
  editWorkbookAliasValue,
  onEditWorkbookAliasValueChange,
  onCloseEditWorkbookAliasDialog,
  onConfirmEditWorkbookAlias,
  isCreateSheetDialogOpen,
  sheetDialogWorkbookName,
  newSheetName,
  onCreateSheetNameChange,
  onCloseCreateSheetDialog,
  onConfirmCreateSheet,
  isEditSheetAliasDialogOpen,
  editSheetAliasTarget,
  editSheetAliasValue,
  onEditSheetAliasValueChange,
  onCloseEditSheetAliasDialog,
  onConfirmEditSheetAlias,
  isRenameSheetDialogOpen,
  renameSheetTarget,
  renameSheetName,
  renameSheetInputRef,
  onRenameSheetNameChange,
  onCloseRenameSheetDialog,
  onConfirmRenameSheet,
  bridgeError,
  canChooseWorkspaceDirectory,
  codegenOutputInputRef,
  isCodegenDialogOpen,
  codegenDialogMode,
  onChooseCodegenOutputDirectory,
  onCloseCodegenDialog,
  onConfirmExportAllWorkbookCode,
  onExportWorkbookCode,
  onCodegenOutputPathChange,
  onSaveWorkspaceCodegenConfig,
  codegenOutputRelativePath,
  activeSheetLabel,
  freezeColumnCount,
  freezeRowCount,
  isFreezeDialogOpen,
  onCloseFreezeDialog,
  onConfirmFreezeDialog,
  onFreezeColumnCountChange,
  onFreezeRowCountChange,
  onResetFreezeDialog,
  visibleColumnCount,
  visibleRowCount,
  workbookContextMenu,
  workbookContextMenuRef,
  onOpenCreateSheetDialog,
  onOpenEditWorkbookAliasDialog,
  onConvertWorkbookCode,
  onCloseWorkbookContextMenu,
  onDeleteWorkbook,
  sheetContextMenu,
  sheetContextMenuRef,
  onOpenRenameSheetDialog,
  onOpenEditSheetAliasDialog,
  onDeleteSheet,
}: WorkbookEditorOverlaysProps) {
  return (
    <>
      <NameInputDialog
        ariaLabel="新建工作簿"
        inputLabel="工作簿名称"
        isOpen={isCreateWorkbookDialogOpen}
        onChange={onCreateWorkbookNameChange}
        onClose={onCloseCreateWorkbookDialog}
        onSubmit={onConfirmCreateWorkbook}
        pathLabel="当前工作区"
        pathValue={workspacePath || "尚未选择工作区"}
        placeholder="例如 Item"
        submitLabel="创建并打开"
        title="新建工作簿"
        value={newWorkbookName}
      />

      <NameInputDialog
        ariaLabel="编辑工作簿别名"
        inputLabel="别名（留空可移除）"
        isOpen={isEditWorkbookAliasDialogOpen}
        onChange={onEditWorkbookAliasValueChange}
        onClose={onCloseEditWorkbookAliasDialog}
        onSubmit={onConfirmEditWorkbookAlias}
        pathLabel="工作簿"
        pathValue={editWorkbookAliasTarget ?? ""}
        placeholder="例如 Items"
        submitLabel="保存"
        title="编辑工作簿别名"
        value={editWorkbookAliasValue}
      />

      <NameInputDialog
        ariaLabel="新建表格"
        inputLabel="表格名称"
        isOpen={isCreateSheetDialogOpen}
        onChange={onCreateSheetNameChange}
        onClose={onCloseCreateSheetDialog}
        onSubmit={onConfirmCreateSheet}
        pathLabel="所属工作簿"
        pathValue={sheetDialogWorkbookName ?? "未选择工作簿"}
        placeholder="例如 Consumable"
        submitLabel="创建并打开"
        title="新建表格"
        value={newSheetName}
      />

      <NameInputDialog
        ariaLabel="编辑表格别名"
        inputLabel="别名（留空可移除）"
        isOpen={isEditSheetAliasDialogOpen}
        onChange={onEditSheetAliasValueChange}
        onClose={onCloseEditSheetAliasDialog}
        onSubmit={onConfirmEditSheetAlias}
        pathLabel="表格"
        pathValue={editSheetAliasTarget ? `${editSheetAliasTarget.workbookName} / ${editSheetAliasTarget.sheetName}` : ""}
        placeholder="例如 Consumables"
        submitLabel="保存"
        title="编辑表格别名"
        value={editSheetAliasValue}
      />

      <NameInputDialog
        ariaLabel="重命名表格"
        inputLabel="新名称"
        inputRef={renameSheetInputRef}
        isOpen={isRenameSheetDialogOpen}
        onChange={onRenameSheetNameChange}
        onClose={onCloseRenameSheetDialog}
        onSubmit={onConfirmRenameSheet}
        pathLabel="目标"
        pathValue={renameSheetTarget ? `${renameSheetTarget.workbookName} / ${renameSheetTarget.sheetName}` : "未选择表格"}
        placeholder="例如 Consumable"
        selectOnFocus
        submitLabel="应用重命名"
        title="重命名表格"
        value={renameSheetName}
      />

      <CodegenDialog
        bridgeError={bridgeError}
        canChooseWorkspaceDirectory={canChooseWorkspaceDirectory}
        inputRef={codegenOutputInputRef}
        isOpen={isCodegenDialogOpen}
        mode={codegenDialogMode}
        onChooseOutputDirectory={onChooseCodegenOutputDirectory}
        onClose={onCloseCodegenDialog}
        onExportAll={onConfirmExportAllWorkbookCode}
        onExportSingle={onExportWorkbookCode}
        onOutputPathChange={onCodegenOutputPathChange}
        onSaveConfig={onSaveWorkspaceCodegenConfig}
        outputRelativePath={codegenOutputRelativePath}
        workspacePath={workspacePath}
      />

      <FreezeDialog
        activeSheetLabel={activeSheetLabel}
        freezeColumnCount={freezeColumnCount}
        freezeRowCount={freezeRowCount}
        isOpen={isFreezeDialogOpen}
        onClose={onCloseFreezeDialog}
        onConfirm={onConfirmFreezeDialog}
        onFreezeColumnCountChange={onFreezeColumnCountChange}
        onFreezeRowCountChange={onFreezeRowCountChange}
        onReset={onResetFreezeDialog}
        visibleColumnCount={visibleColumnCount}
        visibleRowCount={visibleRowCount}
      />

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
            onClick={() => onOpenCreateSheetDialog(workbookContextMenu.workbookName)}
            type="button"
          >
            新建表格
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => onOpenEditWorkbookAliasDialog(workbookContextMenu.workbookName)}
            type="button"
          >
            编辑别名
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => onConvertWorkbookCode(workbookContextMenu.workbookName)}
            type="button"
          >
            导出工作簿代码
          </button>
          <button
            className="tree-context-menu-item is-danger"
            onClick={() => {
              onCloseWorkbookContextMenu();
              void onDeleteWorkbook(workbookContextMenu.workbookName);
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
            onClick={() => onOpenRenameSheetDialog(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            重命名表格
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => onOpenEditSheetAliasDialog(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            编辑别名
          </button>
          <button
            className="tree-context-menu-item"
            onClick={() => onOpenCreateSheetDialog(sheetContextMenu.workbookName)}
            type="button"
          >
            新建表格
          </button>
          <button
            className="tree-context-menu-item is-danger"
            onClick={() => void onDeleteSheet(sheetContextMenu.workbookName, sheetContextMenu.sheetName)}
            type="button"
          >
            删除表格
          </button>
        </div>
      ) : null}
    </>
  );
}