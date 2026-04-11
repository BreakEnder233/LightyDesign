import type { MouseEvent } from "react";

import type { WorkspaceTreeWorkbook } from "../types/desktopApp";

type WorkspaceSidebarProps = {
  workspacePath: string;
  workspaceStatus: "idle" | "loading" | "ready" | "error";
  workbookTree: WorkspaceTreeWorkbook[];
  totalSheetCount: number;
  headerCount: number;
  hasDirtyChanges: boolean;
  workspaceSearch: string;
  workspaceError: string | null;
  focusedWorkbookName: string | null;
  onWorkspaceSearchChange: (value: string) => void;
  onCreateWorkbook: () => void;
  onRetryWorkspaceLoad: () => void;
  onFocusWorkbook: (workbookName: string) => void;
  onOpenWorkbookContextMenu: (event: MouseEvent<HTMLButtonElement>, workbookName: string) => void;
};

export function WorkspaceSidebar({
  workspacePath,
  workspaceStatus,
  workbookTree,
  totalSheetCount,
  headerCount,
  hasDirtyChanges,
  workspaceSearch,
  workspaceError,
  focusedWorkbookName,
  onWorkspaceSearchChange,
  onCreateWorkbook,
  onRetryWorkspaceLoad,
  onFocusWorkbook,
  onOpenWorkbookContextMenu,
}: WorkspaceSidebarProps) {
  return (
    <aside className="workspace-sidebar">
      <div className="brand-block">
        <p className="eyebrow eyebrow-brand">LightyDesign</p>
        <p className="workspace-path compact-workspace-path">{workspacePath || "未打开工作区"}</p>
      </div>

      <section className="sidebar-section workspace-entry-card workspace-summary-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">工作区概览</p>
          </div>
          {workspaceStatus === "loading" ? <span className="badge">加载中</span> : null}
        </div>

        <div className="workspace-stats">
          <div>
            <span>工作簿</span>
            <strong>{workbookTree.length}</strong>
          </div>
          <div>
            <span>表格</span>
            <strong>{totalSheetCount}</strong>
          </div>
          <div>
            <span>表头</span>
            <strong>{headerCount}</strong>
          </div>
        </div>

        <p className="workspace-summary-meta">
          {hasDirtyChanges ? "当前工作区包含未保存修改。" : "当前工作区已同步到界面。"}
        </p>
      </section>

      <section className="sidebar-section tree-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">工作簿</p>
          </div>
        </div>

        <div className="action-grid compact-grid">
          <button
            className="secondary-button"
            disabled={workspaceStatus !== "ready"}
            onClick={onCreateWorkbook}
            type="button"
          >
            新建工作簿
          </button>
          <button
            className="secondary-button"
            disabled={workspaceStatus === "idle" || workspaceStatus === "loading"}
            onClick={onRetryWorkspaceLoad}
            type="button"
          >
            刷新列表
          </button>
        </div>

        <label className="search-field compact-field">
          <span>搜索工作簿或表格</span>
          <input
            onChange={(event) => onWorkspaceSearchChange(event.target.value)}
            placeholder="例如 Item / Consumable"
            type="text"
            value={workspaceSearch}
          />
        </label>

        {workspaceStatus === "idle" ? (
          <div className="empty-panel">
            <strong>等待工作区</strong>
            <p>先从顶部“文件”菜单选择一个包含 headers.json 和工作簿目录的工作区。</p>
          </div>
        ) : null}

        {workspaceStatus === "error" ? (
          <div className="empty-panel is-error">
            <strong>工作区加载失败</strong>
            <p>{workspaceError ?? "未能读取当前工作区。"}</p>
            <button className="secondary-button" onClick={onRetryWorkspaceLoad} type="button">
              重试
            </button>
          </div>
        ) : null}

        {workspaceStatus === "ready" && workbookTree.length === 0 ? (
          <div className="empty-panel">
            <strong>工作区为空</strong>
            <p>{workspaceSearch ? "当前搜索条件没有匹配结果。" : "已读取 headers.json，但暂未发现任何工作簿或表格。"}</p>
          </div>
        ) : null}

        {workspaceStatus === "ready" && workbookTree.length > 0 ? (
          <div className="tree-list">
            {workbookTree.map((workbook) => (
              <button
                className={`tree-workbook-card${focusedWorkbookName === workbook.name ? " is-selected" : ""}`}
                key={workbook.name}
                onClick={() => onFocusWorkbook(workbook.name)}
                onContextMenu={(event) => onOpenWorkbookContextMenu(event, workbook.name)}
                type="button"
              >
                <div className="tree-workbook-header">
                  <div className="tree-workbook-title">
                    <strong>{workbook.name}</strong>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </aside>
  );
}