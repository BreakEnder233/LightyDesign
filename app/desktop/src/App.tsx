import { useMemo, useState } from "react";

import { ToastCenter } from "./components/ToastCenter";
import { VirtualSheetTable } from "./components/VirtualSheetTable";
import { useDesktopHostConnection } from "./hooks/useDesktopHostConnection";
import { useEditorShortcuts, isShortcutModifierPressed } from "./hooks/useEditorShortcuts";
import { useToastCenter } from "./hooks/useToastCenter";
import { useWorkspaceEditor } from "./hooks/useWorkspaceEditor";
import type { ShortcutBinding } from "./types/desktopApp";

function App() {
  const { bridgeStatus, bridgeError, hostInfo, hostHealth } = useDesktopHostConnection();
  const {
    toastNotifications,
    selectedErrorToast,
    setHoveredToastId,
    setSelectedErrorToastId,
    pushToastNotification,
    openToastDetail,
    dismissToast,
    copySelectedErrorDetail,
  } = useToastCenter();

  const {
    workspacePath,
    workspace,
    workspaceStatus,
    workspaceError,
    workspaceSearch,
    setWorkspaceSearch,
    openTabs,
    activeTabId,
    setActiveTabId,
    sheetFilter,
    setSheetFilter,
    workbookTree,
    totalSheetCount,
    activeTab,
    activeSheetState,
    activeSheetData,
    activeSheetRows,
    activeWorkbookSaveState,
    activeWorkbookDirtyTabs,
    filteredRowEntries,
    openSheet,
    closeTab,
    chooseParentDirectoryForWorkspaceCreation,
    createWorkspace,
    chooseWorkspaceDirectory,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    updateCellValue,
    activateWorkbook,
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
  } = useWorkspaceEditor({
    hostInfo,
    onToast: pushToastNotification,
  });

  const hostStatusLabel = bridgeStatus === "unavailable" ? "桥接不可用" : hostHealth?.ok ? "已连接" : "启动中";
  const hostStatusClassName = bridgeStatus === "unavailable" ? "status-pill is-error" : hostHealth?.ok ? "status-pill is-ok" : "status-pill";
  const canUndoActiveSheet = Boolean(activeSheetState?.undoStack?.length);
  const canRedoActiveSheet = Boolean(activeSheetState?.redoStack?.length);
  const canSaveActiveWorkbook = Boolean(
    activeTab && hostInfo && workspacePath && activeWorkbookDirtyTabs.length > 0 && activeWorkbookSaveState?.status !== "saving",
  );
  const canChooseWorkspaceDirectory = bridgeStatus === "ready";
  const hostUrlLabel = bridgeStatus === "unavailable" ? "Electron bridge 未就绪" : hostInfo?.desktopHostUrl ?? "加载中...";
  const runtimeLabel = bridgeStatus === "unavailable" ? "不可用" : hostInfo?.shell ?? "加载中...";
  const [isCreateWorkspaceDialogOpen, setIsCreateWorkspaceDialogOpen] = useState(false);
  const [createWorkspaceParentDirectoryPath, setCreateWorkspaceParentDirectoryPath] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("NewWorkspace");

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "save-active-workbook",
        label: "保存当前工作簿",
        hint: "Ctrl+S",
        enabled: canSaveActiveWorkbook,
        allowInEditableTarget: true,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "s",
        run: () => {
          void saveActiveWorkbook();
        },
      },
      {
        id: "undo-sheet-edit",
        label: "撤销当前 Sheet 编辑",
        hint: "Ctrl+Z",
        enabled: canUndoActiveSheet,
        matches: (event) => isShortcutModifierPressed(event) && !event.shiftKey && event.key.toLowerCase() === "z",
        run: undoActiveSheetEdit,
      },
      {
        id: "redo-sheet-edit",
        label: "恢复当前 Sheet 编辑",
        hint: "Ctrl+Y / Ctrl+Shift+Z",
        enabled: canRedoActiveSheet,
        matches: (event) =>
          isShortcutModifierPressed(event) &&
          ((event.key.toLowerCase() === "y" && !event.shiftKey) || (event.key.toLowerCase() === "z" && event.shiftKey)),
        run: redoActiveSheetEdit,
      },
    ],
    [canRedoActiveSheet, canSaveActiveWorkbook, canUndoActiveSheet, redoActiveSheetEdit, saveActiveWorkbook, undoActiveSheetEdit],
  );

  useEditorShortcuts(shortcutBindings);

  async function handleCopySelectedDetail() {
    const result = await copySelectedErrorDetail();
    if (result.ok) {
      pushToastNotification({
        title: "错误详情已复制",
        detail: `已复制 ${result.title} 的完整错误信息。`,
        source: "system",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3200,
      });
      return;
    }

    pushToastNotification({
      title: "复制错误详情失败",
      detail: result.errorMessage ?? "剪贴板写入失败。",
      source: "system",
      variant: "error",
      canOpenDetail: true,
      durationMs: 8000,
    });
  }

  function handleRunToastAction(toastId: number) {
    const targetToast = toastNotifications.find((toast) => toast.id === toastId);
    if (!targetToast?.action) {
      return;
    }

    if (targetToast.action.kind === "activate-workbook") {
      activateWorkbook(targetToast.action.workbookName);
    }

    dismissToast(toastId);
  }

  async function handleOpenCreateWorkspaceDialog() {
    const parentDirectoryPath = await chooseParentDirectoryForWorkspaceCreation();
    if (!parentDirectoryPath) {
      return;
    }

    setCreateWorkspaceParentDirectoryPath(parentDirectoryPath);
    setNewWorkspaceName("NewWorkspace");
    setIsCreateWorkspaceDialogOpen(true);
  }

  function handleCloseCreateWorkspaceDialog() {
    setIsCreateWorkspaceDialogOpen(false);
    setCreateWorkspaceParentDirectoryPath("");
    setNewWorkspaceName("NewWorkspace");
  }

  async function handleConfirmCreateWorkspace() {
    const created = await createWorkspace(createWorkspaceParentDirectoryPath, newWorkspaceName);
    if (created) {
      handleCloseCreateWorkspaceDialog();
    }
  }

  return (
    <div className="app-shell">
      {isCreateWorkspaceDialogOpen ? (
        <div className="workspace-create-backdrop" onClick={handleCloseCreateWorkspaceDialog} role="presentation">
          <div
            aria-labelledby="workspace-create-title"
            aria-modal="true"
            className="workspace-create-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="workspace-create-header">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2 id="workspace-create-title">新建工作区</h2>
              </div>
            </div>

            <div className="workspace-create-body">
              <p className="workspace-create-path-label">父目录</p>
              <p className="workspace-create-path-value">{createWorkspaceParentDirectoryPath}</p>

              <label className="search-field workspace-create-name-field">
                <span>工作区文件夹名称</span>
                <input
                  autoFocus
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleConfirmCreateWorkspace();
                    }
                  }}
                  placeholder="例如 GameData"
                  type="text"
                  value={newWorkspaceName}
                />
              </label>
            </div>

            <div className="workspace-create-actions">
              <button className="secondary-button" onClick={handleCloseCreateWorkspaceDialog} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleConfirmCreateWorkspace()} type="button">
                创建并打开
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastCenter
        onCloseSelectedToast={() => setSelectedErrorToastId(null)}
        onCopySelectedDetail={() => void handleCopySelectedDetail()}
        onDismissToast={dismissToast}
        onHoverToast={setHoveredToastId}
        onOpenToastDetail={openToastDetail}
        onRunToastAction={handleRunToastAction}
        selectedToast={selectedErrorToast}
        toasts={toastNotifications}
      />

      <aside className="workspace-sidebar">
        <div className="brand-block">
          <p className="eyebrow">Desktop App</p>
          <h1>LightyDesign</h1>
          <p className="sidebar-copy">
            面向策划表协议的桌面编辑器。当前阶段聚焦真实工作区浏览、多标签查看与宿主联调。
          </p>
        </div>

        <section className="sidebar-section workspace-entry-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>选择工作区</h2>
            </div>
            <div className="section-actions">
              <button
                className="secondary-button"
                disabled={!canChooseWorkspaceDirectory}
                onClick={() => void handleOpenCreateWorkspaceDialog()}
                title={canChooseWorkspaceDirectory ? "选择父目录并新建工作区" : bridgeError ?? "当前环境不支持原生目录选择"}
                type="button"
              >
                新建工作区
              </button>
              <button
                className="primary-button"
                disabled={!canChooseWorkspaceDirectory}
                onClick={chooseWorkspaceDirectory}
                title={canChooseWorkspaceDirectory ? "选择一个工作区目录" : bridgeError ?? "当前环境不支持原生目录选择"}
                type="button"
              >
                选择目录
              </button>
            </div>
          </div>

          <p className="path-label">当前路径</p>
          <p className="workspace-path">{workspacePath || "尚未选择工作区目录"}</p>

          <div className="workspace-stats">
            <div>
              <span>工作簿</span>
              <strong>{workbookTree.length}</strong>
            </div>
            <div>
              <span>Sheets</span>
              <strong>{totalSheetCount}</strong>
            </div>
            <div>
              <span>Header Rows</span>
              <strong>{workspace?.headerLayout.count ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="sidebar-section tree-card">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Navigator</p>
              <h2>工作簿树</h2>
            </div>
            {workspaceStatus === "loading" ? <span className="badge">加载中</span> : null}
          </div>

          <label className="search-field">
            <span>搜索工作簿或 Sheet</span>
            <input
              onChange={(event) => setWorkspaceSearch(event.target.value)}
              placeholder="例如 Item / Consumable"
              type="text"
              value={workspaceSearch}
            />
          </label>

          {workspaceStatus === "idle" ? (
            <div className="empty-panel">
              <strong>等待工作区</strong>
              <p>先选择一个包含 headers.json 和工作簿目录的工作区。</p>
            </div>
          ) : null}

          {workspaceStatus === "error" ? (
            <div className="empty-panel is-error">
              <strong>工作区加载失败</strong>
              <p>{workspaceError ?? "未能读取当前工作区。"}</p>
              <button className="secondary-button" onClick={retryWorkspaceLoad} type="button">
                重试
              </button>
            </div>
          ) : null}

          {workspaceStatus === "ready" && workbookTree.length === 0 ? (
            <div className="empty-panel">
              <strong>工作区为空</strong>
              <p>{workspaceSearch ? "当前搜索条件没有匹配结果。" : "已读取 headers.json，但暂未发现任何工作簿或 Sheet。"}</p>
            </div>
          ) : null}

          {workspaceStatus === "ready" && workbookTree.length > 0 ? (
            <div className="tree-list">
              {workbookTree.map((workbook) => (
                <div className="tree-workbook" key={workbook.name}>
                  <div className="tree-workbook-header">
                    <strong>{workbook.name}</strong>
                    <span>{workbook.sheets.length} sheets</span>
                  </div>

                  <div className="tree-sheet-list">
                    {workbook.sheets.map((sheet) => {
                      const tabId = `${sheet.workbookName}::${sheet.sheetName}`;
                      const isActive = activeTabId === tabId;

                      return (
                        <button
                          className={`tree-sheet-button${isActive ? " is-active" : ""}`}
                          key={tabId}
                          onClick={() => openSheet(sheet.workbookName, sheet.sheetName)}
                          type="button"
                        >
                          <span>{sheet.sheetName}</span>
                          <em>{sheet.columnCount} x {sheet.rowCount}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </aside>

      <main className="workspace-main">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Host Bridge</p>
            <h2>桌面壳通过 Electron bridge 连接 DesktopHost 与本地目录能力。</h2>
            <p className="hero-copy">
              通过桌面壳启动时，这里会显示宿主地址、运行时状态以及当前工作区根目录；如果 bridge 缺失，界面会直接提示启动方式，而不是一直显示 Loading。
            </p>
          </div>

          <div className="host-metrics">
            <div>
              <span>Host URL</span>
              <strong>{hostUrlLabel}</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong>{runtimeLabel}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
            </div>
            <div>
              <span>Workspace Root</span>
              <strong>{workspace?.rootPath ?? "未加载"}</strong>
            </div>
          </div>

          {bridgeError ? (
            <div className="bridge-warning-panel">
              <strong>Electron bridge 不可用</strong>
              <p>{bridgeError}</p>
            </div>
          ) : null}
        </section>

        <section className="editor-panel">
          <div className="tab-strip">
            {openTabs.length === 0 ? (
              <div className="tab-strip-empty">打开左侧任意 Sheet，开始查看数据。</div>
            ) : (
              openTabs.map((tab) => (
                <div className={`sheet-tab${tab.id === activeTabId ? " is-active" : ""}`} key={tab.id}>
                  <button className="sheet-tab-trigger" onClick={() => setActiveTabId(tab.id)} type="button">
                    <span>{tab.sheetName}</span>
                    <em>{tab.workbookName}</em>
                  </button>
                  <button className="sheet-tab-close" onClick={() => closeTab(tab.id)} type="button">
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="viewer-panel">
            {!activeTab ? (
              <div className="viewer-empty-state">
                <strong>暂无已打开的 Sheet</strong>
                <p>从左侧工作簿树中选择一个 Sheet，主区域会按需加载真实数据。</p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "loading" ? (
              <div className="viewer-empty-state">
                <strong>正在加载 Sheet</strong>
                <p>
                  {activeTab.workbookName} / {activeTab.sheetName}
                </p>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "error" ? (
              <div className="viewer-empty-state is-error">
                <strong>Sheet 加载失败</strong>
                <p>{activeSheetState.error ?? "未能读取当前 Sheet。"}</p>
                <button className="secondary-button" onClick={retryActiveSheetLoad} type="button">
                  重试
                </button>
              </div>
            ) : null}

            {activeTab && activeSheetState?.status === "ready" && activeSheetData ? (
              <>
                <div className="viewer-header">
                  <div>
                    <p className="eyebrow">Sheet</p>
                    <h3>{activeSheetData.metadata.name}</h3>
                  </div>
                  <div className="viewer-metadata">
                    <span>{activeSheetData.metadata.columnCount} 列</span>
                    <span>{activeSheetData.metadata.rowCount} 行</span>
                    <span>{activeTab.workbookName}</span>
                    <span>{activeWorkbookDirtyTabs.length} dirty tabs</span>
                  </div>
                </div>

                <div className="viewer-toolbar">
                  <label className="search-field sheet-filter-field">
                    <span>筛选当前 Sheet 的文本内容</span>
                    <input
                      onChange={(event) => setSheetFilter(event.target.value)}
                      placeholder="按任意单元格文本过滤"
                      type="text"
                      value={sheetFilter}
                    />
                  </label>

                  <div className="editor-actions-panel">
                    <div className="edit-actions">
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.undoStack?.length}
                        onClick={undoActiveSheetEdit}
                        title="撤销当前 Sheet 编辑 (Ctrl+Z)"
                        type="button"
                      >
                        撤销
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.redoStack?.length}
                        onClick={redoActiveSheetEdit}
                        title="恢复当前 Sheet 编辑 (Ctrl+Y / Ctrl+Shift+Z)"
                        type="button"
                      >
                        恢复
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!activeSheetState.dirty}
                        onClick={restoreActiveSheetDraft}
                        type="button"
                      >
                        还原当前 Sheet
                      </button>
                    </div>

                    <div className="save-panel">
                      <span className="save-status">
                        {activeWorkbookSaveState?.status === "saving"
                          ? "正在保存..."
                          : activeWorkbookSaveState?.status === "saved"
                            ? "保存完成"
                            : activeWorkbookSaveState?.status === "error"
                              ? activeWorkbookSaveState.error ?? "保存失败"
                              : `筛选后 ${filteredRowEntries.length} / ${activeSheetRows.length} 行，撤销栈 ${activeSheetState.undoStack?.length ?? 0}，快捷键 ${shortcutBindings.map((binding) => binding.hint).join(" · ")}`}
                      </span>
                      <div className="save-actions">
                        <span className="save-hint">虚拟滚动已启用</span>
                        <button
                          className="primary-button save-button"
                          disabled={activeWorkbookDirtyTabs.length === 0 || activeWorkbookSaveState?.status === "saving"}
                          onClick={() => void saveActiveWorkbook()}
                          title="保存当前工作簿 (Ctrl+S)"
                          type="button"
                        >
                          保存当前工作簿
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="column-summary-grid">
                  {activeSheetData.metadata.columns.map((column) => (
                    <article className="column-card" key={column.fieldName}>
                      <strong>{column.displayName || column.fieldName}</strong>
                      <span>{column.fieldName}</span>
                      <em>{column.type}</em>
                    </article>
                  ))}
                </div>

                <VirtualSheetTable
                  columns={activeSheetData.metadata.columns}
                  editedCells={activeSheetState.editedCells ?? {}}
                  onEditCell={updateCellValue}
                  rows={filteredRowEntries}
                />
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;