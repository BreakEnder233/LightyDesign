import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  componentStack: string;
};

function formatErrorDetail(error: Error, componentStack: string) {
  const blocks = [`${error.name}: ${error.message}`];

  if (error.stack) {
    blocks.push(error.stack);
  }

  const normalizedComponentStack = componentStack.trim();
  if (normalizedComponentStack.length > 0) {
    blocks.push(`Component stack:\n${normalizedComponentStack}`);
  }

  return blocks.join("\n\n");
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = {
    error: null,
    componentStack: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      componentStack: "",
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled React render error", error, errorInfo.componentStack);
    this.setState({ componentStack: errorInfo.componentStack ?? "" });
  }

  private readonly handleReset = () => {
    this.setState({ error: null, componentStack: "" });
  };

  private readonly handleReload = () => {
    window.location.reload();
  };

  override render() {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    const detailText = formatErrorDetail(error, componentStack);

    return (
      <div className="app-error-boundary-shell">
        <section className="viewer-empty-state is-error app-error-boundary-panel">
          <div className="app-error-boundary-header">
            <p className="eyebrow">前端异常</p>
            <strong>{error.name === "Error" ? "界面渲染失败" : error.name}</strong>
          </div>

          <p className="status-detail">{error.message || "发生了未知异常，当前界面已停止继续渲染。"}</p>

          <div className="app-error-boundary-actions">
            <button className="secondary-button" onClick={this.handleReset} type="button">
              重试渲染
            </button>
            <button className="primary-button" onClick={this.handleReload} type="button">
              重新加载
            </button>
          </div>

          <details className="app-error-boundary-details">
            <summary>查看错误详情</summary>
            <pre className="app-error-boundary-stack">{detailText}</pre>
          </details>
        </section>
      </div>
    );
  }
}