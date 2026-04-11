import type { ToastNotification } from "../types/desktopApp";
import { DialogBackdrop } from "./DialogBackdrop";

type ToastCenterProps = {
  toasts: ToastNotification[];
  selectedToast: ToastNotification | null;
  onHoverToast: (toastId: number | null) => void;
  onOpenToastDetail: (toastId: number) => void;
  onDismissToast: (toastId: number) => void;
  onRunToastAction: (toastId: number) => void;
  onCloseSelectedToast: () => void;
  onCopySelectedDetail: () => void;
};

export function ToastCenter({
  toasts,
  selectedToast,
  onHoverToast,
  onOpenToastDetail,
  onDismissToast,
  onRunToastAction,
  onCloseSelectedToast,
  onCopySelectedDetail,
}: ToastCenterProps) {
  return (
    <>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            className={`toast-message is-${toast.variant}`}
            key={toast.id}
            onMouseEnter={() => onHoverToast(toast.id)}
            onMouseLeave={() => onHoverToast(null)}
          >
            <div className="toast-message-main">
              {toast.canOpenDetail ? (
                <button className="toast-message-trigger" onClick={() => onOpenToastDetail(toast.id)} type="button">
                  <span className="toast-message-title">{toast.title}</span>
                  <span className="toast-message-summary">{toast.summary}</span>
                  <span className="toast-message-meta">点击查看详情</span>
                </button>
              ) : (
                <div className="toast-message-body">
                  <span className="toast-message-title">{toast.title}</span>
                  <span className="toast-message-summary">{toast.summary}</span>
                  <span className="toast-message-meta">{toast.timestamp}</span>
                </div>
              )}

              {toast.action ? (
                <button className="toast-message-action" onClick={() => onRunToastAction(toast.id)} type="button">
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              aria-label="关闭消息气泡"
              className="toast-message-dismiss"
              onClick={() => onDismissToast(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {selectedToast ? (
        <DialogBackdrop className="error-detail-backdrop" onClose={onCloseSelectedToast}>
          <section
            aria-label={`错误详情: ${selectedToast.title}`}
            className="error-detail-dialog"
            role="dialog"
          >
            <div className="error-detail-header">
              <div>
                <p className="eyebrow">错误详情 / {selectedToast.title}</p>
              </div>
              <div className="error-detail-actions">
                <button className="secondary-button" onClick={onCopySelectedDetail} type="button">
                  复制详情
                </button>
                <button className="secondary-button" onClick={onCloseSelectedToast} type="button">
                  关闭
                </button>
              </div>
            </div>
            <div className="error-detail-meta">
              <span>来源: {selectedToast.source}</span>
              <span>时间: {selectedToast.timestamp}</span>
            </div>
            <pre className="error-detail-body">{selectedToast.detail}</pre>
          </section>
        </DialogBackdrop>
      ) : null}
    </>
  );
}