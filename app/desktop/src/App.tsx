import { useEffect, useMemo, useState } from "react";

type HeaderLayoutRow = {
  headerType: string;
};

type SheetColumn = {
  fieldName: string;
  type: string;
  displayName?: string | null;
  isListType: boolean;
  isReferenceType: boolean;
  attributes: Record<string, unknown>;
};

type SheetMetadata = {
  workbookName?: string | null;
  name: string;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
  columns: SheetColumn[];
};

type WorkspaceNavigationSheet = {
  workbookName: string;
  name: string;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
};

type WorkspaceNavigationWorkbook = {
  name: string;
  directoryPath: string;
  sheetCount: number;
  sheets: WorkspaceNavigationSheet[];
};

type WorkspaceNavigationResponse = {
  rootPath: string;
  configFilePath: string;
  headersFilePath: string;
  headerLayout: {
    count: number;
    rows: HeaderLayoutRow[];
  };
  workbooks: WorkspaceNavigationWorkbook[];
};

type SheetResponse = {
  metadata: SheetMetadata;
  rows: string[][];
};

type WorkspaceTreeSheet = {
  workbookName: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
};

type WorkspaceTreeWorkbook = {
  name: string;
  sheets: WorkspaceTreeSheet[];
};

type SheetTab = {
  id: string;
  workbookName: string;
  sheetName: string;
};

type SheetLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  data?: SheetResponse;
  error?: string;
};

const workspaceStorageKey = "lightydesign.workspacePath";
const sheetPageSize = 200;

function buildSheetTabId(workbookName: string, sheetName: string) {
  return `${workbookName}::${sheetName}`;
}

function buildWorkspaceScopedStorageKey(workspacePath: string, key: string) {
  return `${workspaceStorageKey}:${workspacePath}:${key}`;
}

function isSheetTab(value: unknown): value is SheetTab {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SheetTab>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.workbookName === "string" &&
    typeof candidate.sheetName === "string"
  );
}

function isSheetAvailable(workspace: WorkspaceNavigationResponse, tab: SheetTab) {
  return workspace.workbooks.some(
    (workbook) =>
      workbook.name === tab.workbookName &&
      workbook.sheets.some((sheet) => sheet.name === tab.sheetName),
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore invalid JSON payloads and fall back to status-based message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function App() {
  const [hostInfo, setHostInfo] = useState<DesktopHostInfo | null>(null);
  const [hostHealth, setHostHealth] = useState<DesktopHostHealth | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>(() => localStorage.getItem(workspaceStorageKey) ?? "");
  const [workspace, setWorkspace] = useState<WorkspaceNavigationResponse | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [openTabs, setOpenTabs] = useState<SheetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sheetStateMap, setSheetStateMap] = useState<Record<string, SheetLoadState>>({});
  const [sheetFilter, setSheetFilter] = useState("");
  const [sheetPage, setSheetPage] = useState(1);

  useEffect(() => {
    let disposed = false;

    async function loadInfo() {
      const info = await window.lightyDesign.getDesktopHostInfo();
      if (!disposed) {
        setHostInfo(info);
      }
    }

    async function loadHealth() {
      const health = await window.lightyDesign.getDesktopHostHealth();
      if (!disposed) {
        setHostHealth(health);
      }
    }

    void loadInfo();
    void loadHealth();

    const timer = window.setInterval(() => {
      void loadHealth();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!workspacePath) {
      localStorage.removeItem(workspaceStorageKey);
      setWorkspace(null);
      setWorkspaceStatus("idle");
      setWorkspaceError(null);
      setOpenTabs([]);
      setActiveTabId(null);
      setSheetStateMap({});
      return;
    }

    localStorage.setItem(workspaceStorageKey, workspacePath);

    let canceled = false;

    async function loadWorkspace() {
      if (!hostInfo) {
        return;
      }

      setWorkspaceStatus("loading");
      setWorkspaceError(null);

      try {
        const query = new URLSearchParams({ workspacePath });
        const data = await fetchJson<WorkspaceNavigationResponse>(
          `${hostInfo.desktopHostUrl}/api/workspace/navigation?${query.toString()}`,
        );

        if (canceled) {
          return;
        }

        setWorkspace(data);
        setWorkspaceStatus("ready");
        setSheetStateMap({});
        setSheetFilter("");
        setSheetPage(1);
      } catch (error) {
        if (canceled) {
          return;
        }

        setWorkspace(null);
        setWorkspaceStatus("error");
        setWorkspaceError(error instanceof Error ? error.message : "工作区读取失败。");
      }
    }

    void loadWorkspace();

    return () => {
      canceled = true;
    };
  }, [hostInfo, workspacePath, workspaceReloadKey]);

  useEffect(() => {
    if (!workspacePath || !workspace || workspaceStatus !== "ready") {
      return;
    }

    const tabsStorageKey = buildWorkspaceScopedStorageKey(workspacePath, "openTabs");
    const activeTabStorageKey = buildWorkspaceScopedStorageKey(workspacePath, "activeTabId");

    let restoredTabs: SheetTab[] = [];
    const rawTabs = localStorage.getItem(tabsStorageKey);
    if (rawTabs) {
      try {
        const parsed = JSON.parse(rawTabs) as unknown;
        if (Array.isArray(parsed)) {
          restoredTabs = parsed.filter(isSheetTab).filter((tab) => isSheetAvailable(workspace, tab));
        }
      } catch {
        restoredTabs = [];
      }
    }

    const restoredActiveTabId = localStorage.getItem(activeTabStorageKey);
    const nextActiveTabId = restoredTabs.some((tab) => tab.id === restoredActiveTabId)
      ? restoredActiveTabId
      : restoredTabs[0]?.id ?? null;

    setOpenTabs(restoredTabs);
    setActiveTabId(nextActiveTabId);
    setSheetStateMap((current) => {
      const nextStateMap: Record<string, SheetLoadState> = {};
      restoredTabs.forEach((tab) => {
        nextStateMap[tab.id] = current[tab.id] ?? { status: "idle" };
      });
      return nextStateMap;
    });
  }, [workspace, workspacePath, workspaceStatus]);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }

    const tabsStorageKey = buildWorkspaceScopedStorageKey(workspacePath, "openTabs");
    const activeTabStorageKey = buildWorkspaceScopedStorageKey(workspacePath, "activeTabId");

    localStorage.setItem(tabsStorageKey, JSON.stringify(openTabs));
    if (activeTabId) {
      localStorage.setItem(activeTabStorageKey, activeTabId);
    } else {
      localStorage.removeItem(activeTabStorageKey);
    }
  }, [activeTabId, openTabs, workspacePath]);

  useEffect(() => {
    if (!hostInfo || !workspacePath || !activeTabId) {
      return;
    }

    const currentHostInfo = hostInfo;
    const currentActiveTab = openTabs.find((tab) => tab.id === activeTabId);
    if (!currentActiveTab) {
      return;
    }

    const resolvedActiveTab = currentActiveTab;

    const existingState = sheetStateMap[resolvedActiveTab.id];
    if (existingState?.status === "loading" || existingState?.status === "ready") {
      return;
    }

    let canceled = false;

    async function loadSheet() {
      setSheetStateMap((current) => ({
        ...current,
        [resolvedActiveTab.id]: {
          status: "loading",
        },
      }));

      try {
        const query = new URLSearchParams({ workspacePath });
        const workbookName = encodeURIComponent(resolvedActiveTab.workbookName);
        const sheetName = encodeURIComponent(resolvedActiveTab.sheetName);
        const data = await fetchJson<SheetResponse>(
          `${currentHostInfo.desktopHostUrl}/api/workspace/workbooks/${workbookName}/sheets/${sheetName}?${query.toString()}`,
        );

        if (canceled) {
          return;
        }

        setSheetStateMap((current) => ({
          ...current,
          [resolvedActiveTab.id]: {
            status: "ready",
            data,
          },
        }));
      } catch (error) {
        if (canceled) {
          return;
        }

        setSheetStateMap((current) => ({
          ...current,
          [resolvedActiveTab.id]: {
            status: "error",
            error: error instanceof Error ? error.message : "Sheet 读取失败。",
          },
        }));
      }
    }

    void loadSheet();

    return () => {
      canceled = true;
    };
  }, [activeTabId, hostInfo, openTabs, sheetStateMap, workspacePath]);

  useEffect(() => {
    setSheetPage(1);
  }, [activeTabId, sheetFilter]);

  const workbookTree = useMemo<WorkspaceTreeWorkbook[]>(() => {
    if (!workspace) {
      return [];
    }

    const search = workspaceSearch.trim().toLocaleLowerCase();

    return workspace.workbooks
      .map((workbook) => {
        const sheets = workbook.sheets
          .filter((sheet) => {
            if (!search) {
              return true;
            }

            return (
              workbook.name.toLocaleLowerCase().includes(search) ||
              sheet.name.toLocaleLowerCase().includes(search)
            );
          })
          .map((sheet) => ({
            workbookName: workbook.name,
            sheetName: sheet.name,
            rowCount: sheet.rowCount,
            columnCount: sheet.columnCount,
          }));

        if (!search || workbook.name.toLocaleLowerCase().includes(search) || sheets.length > 0) {
          return {
            name: workbook.name,
            sheets,
          };
        }

        return null;
      })
      .filter((workbook): workbook is WorkspaceTreeWorkbook => workbook !== null);
  }, [workspace, workspaceSearch]);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeSheetState = activeTab ? sheetStateMap[activeTab.id] : undefined;
  const activeSheetData = activeSheetState?.data;
  const filteredSheetRows = useMemo(() => {
    const rows = activeSheetData?.rows ?? [];
    const search = sheetFilter.trim().toLocaleLowerCase();

    if (!search) {
      return rows;
    }

    return rows.filter((row) => row.some((cell) => cell.toLocaleLowerCase().includes(search)));
  }, [activeSheetData?.rows, sheetFilter]);
  const sheetPageCount = Math.max(1, Math.ceil(filteredSheetRows.length / sheetPageSize));
  const safeSheetPage = Math.min(sheetPage, sheetPageCount);
  const pagedSheetRows = useMemo(() => {
    const startIndex = (safeSheetPage - 1) * sheetPageSize;
    return filteredSheetRows.slice(startIndex, startIndex + sheetPageSize);
  }, [filteredSheetRows, safeSheetPage]);
  const pageStartRowNumber = filteredSheetRows.length === 0 ? 0 : (safeSheetPage - 1) * sheetPageSize + 1;
  const pageEndRowNumber = filteredSheetRows.length === 0
    ? 0
    : Math.min(filteredSheetRows.length, safeSheetPage * sheetPageSize);
  const hostStatusLabel = hostHealth?.ok ? "Connected" : "Starting";
  const hostStatusClassName = hostHealth?.ok ? "status-pill is-ok" : "status-pill";
  const totalSheetCount = workbookTree.reduce((count, workbook) => count + workbook.sheets.length, 0);

  useEffect(() => {
    if (sheetPage !== safeSheetPage) {
      setSheetPage(safeSheetPage);
    }
  }, [safeSheetPage, sheetPage]);

  function openSheet(workbookName: string, sheetName: string) {
    const id = buildSheetTabId(workbookName, sheetName);

    setOpenTabs((current) => {
      if (current.some((tab) => tab.id === id)) {
        return current;
      }

      return [...current, { id, workbookName, sheetName }];
    });

    setActiveTabId(id);
    setSheetFilter("");
    setSheetPage(1);
  }

  function closeTab(tabId: string) {
    setOpenTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);

      if (tabId === activeTabId) {
        const closingIndex = current.findIndex((tab) => tab.id === tabId);
        const fallbackTab = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0] ?? null;
        setActiveTabId(fallbackTab?.id ?? null);
        setSheetFilter("");
        setSheetPage(1);
      }

      return nextTabs;
    });
  }

  async function chooseWorkspaceDirectory() {
    const selectedPath = await window.lightyDesign.chooseWorkspaceDirectory();
    if (selectedPath) {
      setWorkspacePath(selectedPath);
      setWorkspaceSearch("");
    }
  }

  function retryWorkspaceLoad() {
    if (!workspacePath) {
      return;
    }

    setWorkspaceReloadKey((current) => current + 1);
  }

  function retryActiveSheetLoad() {
    if (!activeTab) {
      return;
    }

    setSheetStateMap((current) => ({
      ...current,
      [activeTab.id]: {
        status: "idle",
      },
    }));
  }

  return (
    <div className="app-shell">
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
            <button className="primary-button" onClick={chooseWorkspaceDirectory} type="button">
              选择目录
            </button>
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
            {workspaceStatus === "loading" ? <span className="badge">Loading</span> : null}
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
                      const tabId = buildSheetTabId(sheet.workbookName, sheet.sheetName);
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
            <h2>DesktopHost 已接入，前端开始消费真实工作区接口。</h2>
            <p className="hero-copy">
              第三批功能开始处理真实使用形态：当前 workspace 的 tabs 和激活状态会被持久化，Sheet 查看区也加入分页，避免大表一次性渲染过重。
            </p>
          </div>

          <div className="host-metrics">
            <div>
              <span>Host URL</span>
              <strong>{hostInfo?.desktopHostUrl ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong>{hostInfo?.shell ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
            </div>
            <div>
              <span>Workspace Root</span>
              <strong>{workspace?.rootPath ?? "Not loaded"}</strong>
            </div>
          </div>
        </section>

        <section className="editor-panel">
          <div className="tab-strip">
            {openTabs.length === 0 ? (
              <div className="tab-strip-empty">打开左侧任意 Sheet，开始查看数据。</div>
            ) : (
              openTabs.map((tab) => (
                <div
                  className={`sheet-tab${tab.id === activeTabId ? " is-active" : ""}`}
                  key={tab.id}
                >
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

                  <div className="pagination-panel">
                    <span className="pagination-status">
                      显示 {pageStartRowNumber}-{pageEndRowNumber} / {filteredSheetRows.length || 0} 行
                    </span>
                    <div className="pagination-controls">
                      <button
                        className="secondary-button"
                        disabled={safeSheetPage <= 1}
                        onClick={() => setSheetPage((current) => Math.max(1, current - 1))}
                        type="button"
                      >
                        上一页
                      </button>
                      <span className="pagination-page-indicator">第 {safeSheetPage} / {sheetPageCount} 页</span>
                      <button
                        className="secondary-button"
                        disabled={safeSheetPage >= sheetPageCount}
                        onClick={() => setSheetPage((current) => Math.min(sheetPageCount, current + 1))}
                        type="button"
                      >
                        下一页
                      </button>
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

                <div className="table-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th className="row-number-cell is-header">#</th>
                        {activeSheetData.metadata.columns.map((column) => (
                          <th key={column.fieldName}>
                            <div>{column.displayName || column.fieldName}</div>
                            <small>{column.type}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSheetRows.length === 0 ? (
                        <tr>
                          <td className="table-empty" colSpan={(activeSheetData.metadata.columns.length || 1) + 1}>
                            {activeSheetData.rows.length === 0 ? "当前 Sheet 没有数据行。" : "没有匹配当前筛选条件的数据。"}
                          </td>
                        </tr>
                      ) : (
                        pagedSheetRows.map((row, rowIndex) => (
                          <tr key={`${activeTab.id}-row-${pageStartRowNumber + rowIndex}`}>
                            <td className="row-number-cell">{pageStartRowNumber + rowIndex}</td>
                            {activeSheetData.metadata.columns.map((column, columnIndex) => (
                              <td key={`${column.fieldName}-${pageStartRowNumber + rowIndex}`}>{row[columnIndex] ?? ""}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;