import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

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

type WorkbookResponse = {
  name: string;
  directoryPath: string;
  previewOnly: boolean;
  sheets: SheetResponse[];
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
  draftRows?: string[][];
  editedCells?: Record<string, string>;
  undoStack?: CellEditRecord[];
  redoStack?: CellEditRecord[];
  dirty?: boolean;
  error?: string;
};

type WorkbookSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
};

type CellEditRecord = {
  rowIndex: number;
  columnIndex: number;
  previousValue: string;
  nextValue: string;
};

type ColumnEditorKind = "text" | "number" | "boolean" | "reference" | "list";

type ShortcutBinding = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  matches: (event: KeyboardEvent) => boolean;
  run: () => void;
};

const workspaceStorageKey = "lightydesign.workspacePath";
const rowHeight = 42;
const overscanCount = 12;

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

function buildCellKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`;
}

function cloneRows(rows: string[][]) {
  return rows.map((row) => [...row]);
}

function updateRowsAtCell(rows: string[][], rowIndex: number, columnIndex: number, nextValue: string) {
  const nextRows = [...rows];
  const nextRow = [...(nextRows[rowIndex] ?? [])];
  nextRow[columnIndex] = nextValue;
  nextRows[rowIndex] = nextRow;
  return nextRows;
}

function getColumnEditorKind(column: SheetColumn): ColumnEditorKind {
  const normalizedType = column.type.trim().toLocaleLowerCase();

  if (normalizedType === "bool" || normalizedType === "boolean") {
    return "boolean";
  }

  if (["int", "long", "float", "double", "decimal", "short", "byte"].includes(normalizedType)) {
    return "number";
  }

  if (column.isReferenceType) {
    return "reference";
  }

  if (column.isListType) {
    return "list";
  }

  return "text";
}

function isShortcutModifierPressed(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey;
}

function isShortcutTargetAllowed(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return target.classList.contains("virtual-cell-input");
  }

  if (target.isContentEditable) {
    return false;
  }

  return true;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
  const [workbookSaveStateMap, setWorkbookSaveStateMap] = useState<Record<string, WorkbookSaveState>>({});
  const [sheetFilter, setSheetFilter] = useState("");
  const hasDirtyChanges = useMemo(
    () => Object.values(sheetStateMap).some((sheetState) => sheetState.dirty),
    [sheetStateMap],
  );

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
        setWorkbookSaveStateMap({});
        setSheetFilter("");
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
            draftRows: cloneRows(data.rows),
            editedCells: {},
            undoStack: [],
            redoStack: [],
            dirty: false,
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
  const activeSheetRows = activeSheetState?.draftRows ?? activeSheetData?.rows ?? [];
  const deferredWorkspaceSearch = useDeferredValue(workspaceSearch);
  const deferredSheetFilter = useDeferredValue(sheetFilter);
  const hostStatusLabel = hostHealth?.ok ? "Connected" : "Starting";
  const hostStatusClassName = hostHealth?.ok ? "status-pill is-ok" : "status-pill";
  const totalSheetCount = workbookTree.reduce((count, workbook) => count + workbook.sheets.length, 0);
  const activeWorkbookSaveState = activeTab ? workbookSaveStateMap[activeTab.workbookName] : undefined;
  const activeWorkbookDirtyTabs = useMemo(
    () => openTabs.filter((tab) => tab.workbookName === activeTab?.workbookName && sheetStateMap[tab.id]?.dirty),
    [activeTab?.workbookName, openTabs, sheetStateMap],
  );
  const canUndoActiveSheet = Boolean(activeSheetState?.undoStack?.length);
  const canRedoActiveSheet = Boolean(activeSheetState?.redoStack?.length);
  const filteredRowEntries = useMemo(() => {
    const search = deferredSheetFilter.trim().toLocaleLowerCase();
    const indexedRows = activeSheetRows.map((row, rowIndex) => ({
      row,
      rowIndex,
    }));

    if (!search) {
      return indexedRows;
    }

    return indexedRows.filter(({ row }) => row.some((cell) => cell.toLocaleLowerCase().includes(search)));
  }, [activeSheetRows, deferredSheetFilter]);

  useEffect(() => {
    if (!hasDirtyChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDirtyChanges]);

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
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
    [canRedoActiveSheet, canUndoActiveSheet, redoActiveSheetEdit, undoActiveSheetEdit],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isShortcutTargetAllowed(event.target)) {
        return;
      }

      const matchedShortcut = shortcutBindings.find((shortcut) => shortcut.enabled && shortcut.matches(event));
      if (!matchedShortcut) {
        return;
      }

      event.preventDefault();
      matchedShortcut.run();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcutBindings]);

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
  }

  function closeTab(tabId: string) {
    const closingSheetState = sheetStateMap[tabId];
    if (closingSheetState?.dirty) {
      const shouldClose = window.confirm("当前 Sheet 有未保存修改，确认关闭这个标签页吗？");
      if (!shouldClose) {
        return;
      }
    }

    setOpenTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);

      if (tabId === activeTabId) {
        const closingIndex = current.findIndex((tab) => tab.id === tabId);
        const fallbackTab = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0] ?? null;
        setActiveTabId(fallbackTab?.id ?? null);
        setSheetFilter("");
      }

      return nextTabs;
    });
  }

  async function chooseWorkspaceDirectory() {
    if (hasDirtyChanges) {
      const shouldSwitch = window.confirm("当前存在未保存修改，确认切换工作区目录吗？");
      if (!shouldSwitch) {
        return;
      }
    }

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

  function updateCellValue(rowIndex: number, columnIndex: number, nextValue: string) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    const currentDraftRows = activeSheetState.draftRows ?? activeSheetState.data.rows;
    const previousValue = currentDraftRows[rowIndex]?.[columnIndex] ?? "";
    if (previousValue === nextValue) {
      return;
    }

    const originalValue = activeSheetState.data.rows[rowIndex]?.[columnIndex] ?? "";
    const cellKey = buildCellKey(rowIndex, columnIndex);

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!currentSheetState?.data) {
        return current;
      }

      const nextDraftRows = updateRowsAtCell(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        rowIndex,
        columnIndex,
        nextValue,
      );

      const nextEditedCells = {
        ...(currentSheetState.editedCells ?? {}),
      };

      if (nextValue === originalValue) {
        delete nextEditedCells[cellKey];
      } else {
        nextEditedCells[cellKey] = nextValue;
      }

      return {
        ...current,
        [activeTab.id]: {
          ...currentSheetState,
          draftRows: nextDraftRows,
          editedCells: nextEditedCells,
          undoStack: [
            ...(currentSheetState.undoStack ?? []),
            {
              rowIndex,
              columnIndex,
              previousValue,
              nextValue,
            },
          ],
          redoStack: [],
          dirty: Object.keys(nextEditedCells).length > 0,
        },
      };
    });

    setWorkbookSaveStateMap((current) => ({
      ...current,
      [activeTab.workbookName]: {
        status: "idle",
      },
    }));
  }

  function undoActiveSheetEdit() {
    if (!activeTab) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!currentSheetState?.data || !currentSheetState.undoStack?.length) {
        return current;
      }

      const undoStack = [...currentSheetState.undoStack];
      const lastEdit = undoStack.pop();
      if (!lastEdit) {
        return current;
      }

      const nextDraftRows = updateRowsAtCell(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        lastEdit.rowIndex,
        lastEdit.columnIndex,
        lastEdit.previousValue,
      );

      const originalValue = currentSheetState.data.rows[lastEdit.rowIndex]?.[lastEdit.columnIndex] ?? "";
      const cellKey = buildCellKey(lastEdit.rowIndex, lastEdit.columnIndex);
      const nextEditedCells = {
        ...(currentSheetState.editedCells ?? {}),
      };

      if (lastEdit.previousValue === originalValue) {
        delete nextEditedCells[cellKey];
      } else {
        nextEditedCells[cellKey] = lastEdit.previousValue;
      }

      return {
        ...current,
        [activeTab.id]: {
          ...currentSheetState,
          draftRows: nextDraftRows,
          editedCells: nextEditedCells,
          undoStack,
          redoStack: [...(currentSheetState.redoStack ?? []), lastEdit],
          dirty: Object.keys(nextEditedCells).length > 0,
        },
      };
    });

    setWorkbookSaveStateMap((current) => ({
      ...current,
      [activeTab.workbookName]: {
        status: "idle",
      },
    }));
  }

  function redoActiveSheetEdit() {
    if (!activeTab) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!currentSheetState?.data || !currentSheetState.redoStack?.length) {
        return current;
      }

      const redoStack = [...currentSheetState.redoStack];
      const lastRedo = redoStack.pop();
      if (!lastRedo) {
        return current;
      }

      const nextDraftRows = updateRowsAtCell(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        lastRedo.rowIndex,
        lastRedo.columnIndex,
        lastRedo.nextValue,
      );

      const originalValue = currentSheetState.data.rows[lastRedo.rowIndex]?.[lastRedo.columnIndex] ?? "";
      const cellKey = buildCellKey(lastRedo.rowIndex, lastRedo.columnIndex);
      const nextEditedCells = {
        ...(currentSheetState.editedCells ?? {}),
      };

      if (lastRedo.nextValue === originalValue) {
        delete nextEditedCells[cellKey];
      } else {
        nextEditedCells[cellKey] = lastRedo.nextValue;
      }

      return {
        ...current,
        [activeTab.id]: {
          ...currentSheetState,
          draftRows: nextDraftRows,
          editedCells: nextEditedCells,
          undoStack: [...(currentSheetState.undoStack ?? []), lastRedo],
          redoStack,
          dirty: Object.keys(nextEditedCells).length > 0,
        },
      };
    });

    setWorkbookSaveStateMap((current) => ({
      ...current,
      [activeTab.workbookName]: {
        status: "idle",
      },
    }));
  }

  function restoreActiveSheetDraft() {
    if (!activeTab) {
      return;
    }

    const shouldRestore = window.confirm("确认恢复当前 Sheet 到最近一次保存状态吗？");
    if (!shouldRestore) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!currentSheetState?.data) {
        return current;
      }

      return {
        ...current,
        [activeTab.id]: {
          ...currentSheetState,
          draftRows: cloneRows(currentSheetState.data.rows),
          editedCells: {},
          undoStack: [],
          redoStack: [],
          dirty: false,
        },
      };
    });

    setWorkbookSaveStateMap((current) => ({
      ...current,
      [activeTab.workbookName]: {
        status: "idle",
      },
    }));
  }

  async function saveActiveWorkbook() {
    if (!activeTab || !hostInfo || !workspacePath || activeWorkbookDirtyTabs.length === 0) {
      return;
    }

    const workbookName = activeTab.workbookName;
    setWorkbookSaveStateMap((current) => ({
      ...current,
      [workbookName]: {
        status: "saving",
      },
    }));

    try {
      const query = new URLSearchParams({ workspacePath });
      const workbookResponse = await fetchJson<WorkbookResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(workbookName)}?${query.toString()}`,
      );

      const dirtySheetMap = new Map(
        activeWorkbookDirtyTabs.map((tab) => [tab.sheetName, sheetStateMap[tab.id]]),
      );

      const payload = {
        workspacePath,
        workbook: {
          name: workbookResponse.name,
          sheets: workbookResponse.sheets.map((sheet) => {
            const dirtySheetState = dirtySheetMap.get(sheet.metadata.name);
            const rows = dirtySheetState?.draftRows ?? sheet.rows;

            return {
              name: sheet.metadata.name,
              columns: sheet.metadata.columns.map((column) => ({
                fieldName: column.fieldName,
                type: column.type,
                displayName: column.displayName,
                attributes: column.attributes,
              })),
              rows,
            };
          }),
        },
      };

      const savedWorkbook = await fetchJson<WorkbookResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const savedSheetMap = new Map(savedWorkbook.sheets.map((sheet) => [sheet.metadata.name, sheet]));

      setSheetStateMap((current) => {
        const nextStateMap = { ...current };

        openTabs
          .filter((tab) => tab.workbookName === workbookName)
          .forEach((tab) => {
            const savedSheet = savedSheetMap.get(tab.sheetName);
            if (!savedSheet) {
              return;
            }

            nextStateMap[tab.id] = {
              status: "ready",
              data: savedSheet,
              draftRows: cloneRows(savedSheet.rows),
              editedCells: {},
              undoStack: [],
              redoStack: [],
              dirty: false,
            };
          });

        return nextStateMap;
      });

      setWorkbookSaveStateMap((current) => ({
        ...current,
        [workbookName]: {
          status: "saved",
        },
      }));
    } catch (error) {
      setWorkbookSaveStateMap((current) => ({
        ...current,
        [workbookName]: {
          status: "error",
          error: error instanceof Error ? error.message : "保存工作簿失败。",
        },
      }));
    }
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
              第四批功能开始把 viewer 演进成真正的编辑器基础：当前表格改为真实虚拟滚动，单元格可直接编辑，并可按工作簿调用保存接口写回工作区。
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

type VirtualSheetTableProps = {
  columns: SheetColumn[];
  rows: Array<{
    row: string[];
    rowIndex: number;
  }>;
  editedCells: Record<string, string>;
  onEditCell: (rowIndex: number, columnIndex: number, nextValue: string) => void;
};

function VirtualSheetTable({ columns, rows, editedCells, onEditCell }: VirtualSheetTableProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const gridTemplateColumns = useMemo(
    () => `72px repeat(${columns.length}, minmax(180px, 1fr))`,
    [columns.length],
  );
  const minTableWidth = `${72 + columns.length * 180}px`;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: overscanCount,
  });

  function syncHeaderScroll() {
    if (!bodyRef.current || !headerRef.current) {
      return;
    }

    headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
  }

  if (rows.length === 0) {
    return (
      <div className="table-empty-panel">
        没有匹配当前筛选条件的数据。
      </div>
    );
  }

  return (
    <div className="virtual-table-shell">
      <div className="virtual-table-header-scroll" ref={headerRef}>
        <div className="virtual-table-header" style={{ gridTemplateColumns, minWidth: minTableWidth }}>
          <div className="virtual-header-cell row-number-cell is-header">#</div>
          {columns.map((column) => (
            <div className="virtual-header-cell" key={column.fieldName}>
              <div>{column.displayName || column.fieldName}</div>
              <small>{column.type}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="virtual-table-body-scroll" onScroll={syncHeaderScroll} ref={bodyRef}>
        <div className="virtual-table-canvas" style={{ height: rowVirtualizer.getTotalSize(), minWidth: minTableWidth }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowEntry = rows[virtualRow.index];
            const visualRowNumber = rowEntry.rowIndex + 1;

            return (
              <div
                className="virtual-table-row"
                key={visualRowNumber}
                style={{
                  gridTemplateColumns,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="virtual-row-number row-number-cell">{visualRowNumber}</div>
                {columns.map((column, columnIndex) => {
                  const cellKey = buildCellKey(rowEntry.rowIndex, columnIndex);
                  const isDirty = Object.prototype.hasOwnProperty.call(editedCells, cellKey);
                  const editorKind = getColumnEditorKind(column);
                  const cellValue = rowEntry.row[columnIndex] ?? "";

                  return (
                    <label className={`virtual-cell is-${editorKind}${isDirty ? " is-dirty" : ""}`} key={`${column.fieldName}-${visualRowNumber}`}>
                      {editorKind === "boolean" ? (
                        <select
                          className="virtual-cell-input virtual-cell-select"
                          onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
                          value={cellValue}
                        >
                          <option value="">(empty)</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          className={`virtual-cell-input${editorKind === "reference" || editorKind === "list" ? " is-code" : ""}`}
                          inputMode={editorKind === "number" ? "decimal" : "text"}
                          onChange={(event) => onEditCell(rowEntry.rowIndex, columnIndex, event.target.value)}
                          placeholder={
                            editorKind === "reference"
                              ? "[[id]]"
                              : editorKind === "list"
                                ? "逗号分隔值"
                                : undefined
                          }
                          spellCheck={editorKind === "reference" || editorKind === "list" ? false : true}
                          type="text"
                          value={cellValue}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;