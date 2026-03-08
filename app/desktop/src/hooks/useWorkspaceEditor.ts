import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  buildCellKey,
  buildSheetTabId,
  buildWorkspaceScopedStorageKey,
  cloneRows,
  isSheetAvailable,
  isSheetTab,
  type SheetLoadState,
  type SheetResponse,
  type SheetTab,
  type WorkbookResponse,
  type WorkbookSaveState,
  type WorkspaceNavigationResponse,
  type WorkspaceTreeWorkbook,
  updateRowsAtCell,
} from "../types/desktopApp";

const workspaceStorageKey = "lightydesign.workspacePath";

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

function getDesktopBridge() {
  if (!window.lightyDesign) {
    throw new Error(
      "当前运行环境未注入 Electron bridge。请选择通过 Electron 桌面壳启动应用，例如执行 powershell -ExecutionPolicy Bypass -File .\\ShellFiles\\Bootstrap-LightyDesign.ps1 -RunDesktop。",
    );
  }

  return window.lightyDesign;
}

type UseWorkspaceEditorArgs = {
  hostInfo: DesktopHostInfo | null;
  onToast: (toast: {
    title: string;
    detail?: string;
    source: "workspace" | "sheet" | "save" | "system";
    variant: "error" | "success";
    canOpenDetail: boolean;
    durationMs?: number;
    action?: {
      label: string;
      kind: "activate-workbook";
      workbookName: string;
    };
  }) => void;
};

export function useWorkspaceEditor({ hostInfo, onToast }: UseWorkspaceEditorArgs) {
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

        const errorMessage = error instanceof Error ? error.message : "工作区读取失败。";
        setWorkspace(null);
        setWorkspaceStatus("error");
        setWorkspaceError(errorMessage);
        onToast({
          title: "工作区加载失败",
          detail: errorMessage,
          source: "workspace",
          variant: "error",
          canOpenDetail: true,
          durationMs: 8000,
        });
      }
    }

    void loadWorkspace();

    return () => {
      canceled = true;
    };
  }, [hostInfo, onToast, workspacePath, workspaceReloadKey]);

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

    const resolvedActiveTab = openTabs.find((tab) => tab.id === activeTabId);
    if (!resolvedActiveTab) {
      return;
    }

    const activeTabToLoad = resolvedActiveTab;
    const existingState = sheetStateMap[activeTabToLoad.id];
    if (existingState?.status === "loading" || existingState?.status === "ready") {
      return;
    }

    let canceled = false;

    async function loadSheet() {
      setSheetStateMap((current) => ({
        ...current,
        [activeTabToLoad.id]: {
          status: "loading",
        },
      }));

      try {
        const query = new URLSearchParams({ workspacePath });
        const workbookName = encodeURIComponent(activeTabToLoad.workbookName);
        const sheetName = encodeURIComponent(activeTabToLoad.sheetName);
        const data = await fetchJson<SheetResponse>(
          `${hostInfo.desktopHostUrl}/api/workspace/workbooks/${workbookName}/sheets/${sheetName}?${query.toString()}`,
        );

        if (canceled) {
          return;
        }

        setSheetStateMap((current) => ({
          ...current,
          [activeTabToLoad.id]: {
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

        const errorMessage = error instanceof Error ? error.message : "Sheet 读取失败。";
        setSheetStateMap((current) => ({
          ...current,
          [activeTabToLoad.id]: {
            status: "error",
            error: errorMessage,
          },
        }));
        onToast({
          title: `Sheet 加载失败: ${activeTabToLoad.sheetName}`,
          detail: errorMessage,
          source: "sheet",
          variant: "error",
          canOpenDetail: true,
          durationMs: 8000,
        });
      }
    }

    void loadSheet();

    return () => {
      canceled = true;
    };
  }, [activeTabId, hostInfo, onToast, openTabs, sheetStateMap, workspacePath]);

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
  const deferredSheetFilter = useDeferredValue(sheetFilter);
  const totalSheetCount = workbookTree.reduce((count, workbook) => count + workbook.sheets.length, 0);
  const activeWorkbookSaveState = activeTab ? workbookSaveStateMap[activeTab.workbookName] : undefined;
  const activeWorkbookDirtyTabs = useMemo(
    () => openTabs.filter((tab) => tab.workbookName === activeTab?.workbookName && sheetStateMap[tab.id]?.dirty),
    [activeTab?.workbookName, openTabs, sheetStateMap],
  );
  const filteredRowEntries = useMemo(() => {
    const search = deferredSheetFilter.trim().toLocaleLowerCase();
    const indexedRows = activeSheetRows.map((row, rowIndex) => ({ row, rowIndex }));

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

    try {
      const selectedPath = await getDesktopBridge().chooseWorkspaceDirectory();
      if (selectedPath) {
        setWorkspacePath(selectedPath);
        setWorkspaceSearch("");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "无法打开工作区目录选择器。";
      onToast({
        title: "无法选择工作区目录",
        detail: errorMessage,
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
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

  function activateWorkbook(workbookName: string) {
    const existingTab = openTabs.find((tab) => tab.workbookName === workbookName);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    const targetWorkbook = workspace?.workbooks.find((workbook) => workbook.name === workbookName);
    const firstSheet = targetWorkbook?.sheets[0];
    if (firstSheet) {
      openSheet(firstSheet.workbookName, firstSheet.name);
    }
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

      const dirtySheetMap = new Map(activeWorkbookDirtyTabs.map((tab) => [tab.sheetName, sheetStateMap[tab.id]]));

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
      onToast({
        title: `工作簿保存成功: ${workbookName}`,
        detail: `已成功保存 ${activeWorkbookDirtyTabs.length} 个脏 Sheet。`,
        source: "save",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
        action: {
          label: "定位到工作簿",
          kind: "activate-workbook",
          workbookName,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "保存工作簿失败。";
      setWorkbookSaveStateMap((current) => ({
        ...current,
        [workbookName]: {
          status: "error",
          error: errorMessage,
        },
      }));
      onToast({
        title: `工作簿保存失败: ${workbookName}`,
        detail: errorMessage,
        source: "save",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  return {
    workspacePath,
    setWorkspacePath,
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
    hasDirtyChanges,
    openSheet,
    closeTab,
    chooseWorkspaceDirectory,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    updateCellValue,
    activateWorkbook,
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
  };
}