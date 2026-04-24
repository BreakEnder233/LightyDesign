import type { RefObject } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";

type CodegenDialogMode = "single" | "batch" | "all";

interface CodegenDialogProps {
  isOpen: boolean;
  mode: CodegenDialogMode;
  subjectLabel?: string;
  outputRelativePath: string;
  canChooseWorkspaceDirectory: boolean;
  workspacePath: string;
  bridgeError: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onOutputPathChange: (value: string) => void;
  onChooseOutputDirectory: () => void | Promise<void>;
  onSaveConfig: () => void | Promise<void>;
  onExportSingle: () => void | Promise<void>;
  onExportBatch?: () => void | Promise<void>;
  onExportAll: () => void | Promise<void>;
}

export function CodegenDialog({
  isOpen,
  mode,
  subjectLabel = "工作簿",
  outputRelativePath,
  canChooseWorkspaceDirectory,
  workspacePath,
  bridgeError,
  inputRef,
  onClose,
  onOutputPathChange,
  onChooseOutputDirectory,
  onSaveConfig,
  onExportSingle,
  onExportBatch,
  onExportAll,
}: CodegenDialogProps) {
  if (!isOpen) {
    return null;
  }

  const title = mode === "all"
    ? `导出全部${subjectLabel}代码`
    : mode === "batch"
      ? `批量导出${subjectLabel}代码`
      : `导出${subjectLabel}代码`;
  const submit = mode === "all" ? onExportAll : mode === "batch" ? (onExportBatch ?? onExportAll) : onExportSingle;
  const submitLabel = mode === "all" ? "导出全部代码" : mode === "batch" ? "批量导出代码" : "导出代码";

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label={title} aria-modal="true" className="workspace-create-dialog" role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{title}</p>
          </div>
        </div>

        <div className="workspace-create-body">
          <label className="search-field workspace-create-name-field">
            <span>输出相对路径</span>
            <input
              ref={inputRef}
              onChange={(event) => onOutputPathChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="例如 Generated/Config 或 ../Shared/Generated"
              type="text"
              value={outputRelativePath}
            />
          </label>

          <div className="action-grid compact-grid codegen-dialog-actions">
            <button
              className="secondary-button"
              disabled={!canChooseWorkspaceDirectory || !workspacePath}
              onClick={() => void onChooseOutputDirectory()}
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
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="secondary-button" onClick={() => void onSaveConfig()} type="button">
            保存配置
          </button>
          <button className="primary-button" onClick={() => void submit()} type="button">
            {submitLabel}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}