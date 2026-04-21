import { DialogBackdrop } from "../../components/DialogBackdrop";

interface FreezeDialogProps {
  isOpen: boolean;
  activeSheetLabel: string;
  visibleRowCount: number;
  visibleColumnCount: number;
  freezeRowCount: number;
  freezeColumnCount: number;
  onClose: () => void;
  onConfirm: () => void;
  onReset: () => void;
  onFreezeRowCountChange: (value: number) => void;
  onFreezeColumnCountChange: (value: number) => void;
}

export function FreezeDialog({
  isOpen,
  activeSheetLabel,
  visibleRowCount,
  visibleColumnCount,
  freezeRowCount,
  freezeColumnCount,
  onClose,
  onConfirm,
  onReset,
  onFreezeRowCountChange,
  onFreezeColumnCountChange,
}: FreezeDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
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
          <p className="workspace-create-path-value">{activeSheetLabel}</p>

          <div className="freeze-dialog-grid">
            <label className="search-field freeze-dialog-field">
              <span>冻结行数</span>
              <input
                max={visibleRowCount}
                min={0}
                onChange={(event) => onFreezeRowCountChange(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onConfirm();
                  }
                }}
                type="number"
                value={freezeRowCount}
              />
            </label>

            <label className="search-field freeze-dialog-field">
              <span>冻结列数</span>
              <input
                max={visibleColumnCount}
                min={0}
                onChange={(event) => onFreezeColumnCountChange(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onConfirm();
                  }
                }}
                type="number"
                value={freezeColumnCount}
              />
            </label>
          </div>

          <p className="workspace-create-path-label codegen-dialog-caption">
            当前可见数据共有 {visibleRowCount} 行、{visibleColumnCount} 列。输入 0 表示不冻结对应方向。
          </p>
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="secondary-button" onClick={onReset} type="button">
            清空
          </button>
          <button className="primary-button" onClick={onConfirm} type="button">
            应用冻结
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}