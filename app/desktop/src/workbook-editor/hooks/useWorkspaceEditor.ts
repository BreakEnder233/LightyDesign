import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { fetchJson, getDesktopBridge } from "../../utils/desktopHost";

import {
  buildCellKey,
  buildSheetTabId,
  buildWorkspaceScopedStorageKey,
  cloneColumns,
  cloneRows,
  normalizeSheetColumnForSave,
  type HeaderPropertySchema,
  type TypeMetadataResponse,
  isSheetAvailable,
  isSheetTab,
  type CellEditInput,
  type CellEditRecord,
  type SheetHistoryEntry,
  type SheetColumn,
  type SheetLoadState,
  type SheetResponse,
  type SheetTab,
  type WorkbookCodegenExportResponse,
  type WorkbookValidationResponse,
  type WorkbookResponse,
  type WorkbookSaveState,
  type WorkspaceNavigationResponse,
  type WorkspaceTreeWorkbook,
  updateRowsAtCell,
} from "../types/desktopApp";

const workspaceStorageKey = "lightydesign.workspacePath";
const defaultWorkbookSheetName = "Sheet1";

function isValidWorkspaceName(workspaceName: string) {
  return workspaceName.length > 0 && !/[\\/:*?"<>|]/.test(workspaceName);
}

function removeWorkbookTabs(openTabs: SheetTab[], workbookName: string) {
  return openTabs.filter((tab) => tab.workbookName !== workbookName);
}

function removeSheetTabs(openTabs: SheetTab[], workbookName: string, sheetName: string) {
  return openTabs.filter((tab) => !(tab.workbookName === workbookName && tab.sheetName === sheetName));
}

function getDirtyTabs(openTabs: SheetTab[], sheetStateMap: Record<string, SheetLoadState>) {
  return openTabs.filter((tab) => sheetStateMap[tab.id]?.dirty);
}

function renameSheetTabs(openTabs: SheetTab[], workbookName: string, sheetName: string, newSheetName: string) {
  return openTabs.map((tab) => {
    if (tab.workbookName !== workbookName || tab.sheetName !== sheetName) {
      return tab;
    }

    return {
      ...tab,
      id: buildSheetTabId(workbookName, newSheetName),
      sheetName: newSheetName,
    };
  });
}

function applyEditsToRows(rows: string[][], edits: Array<Pick<CellEditRecord, "rowIndex" | "columnIndex"> & { value: string }>) {
  let nextRows = rows;

  edits.forEach((edit) => {
    nextRows = updateRowsAtCell(nextRows, edit.rowIndex, edit.columnIndex, edit.value);
  });

  return nextRows;
}

function buildEditedCellsFromRows(originalRows: string[][], draftRows: string[][], columnCount: number) {
  const nextEditedCells: Record<string, string> = {};
  const rowCount = Math.max(originalRows.length, draftRows.length);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const originalValue = originalRows[rowIndex]?.[columnIndex] ?? "";
      const nextValue = draftRows[rowIndex]?.[columnIndex] ?? "";

      if (originalValue !== nextValue) {
        nextEditedCells[buildCellKey(rowIndex, columnIndex)] = nextValue;
      }
    }
  }

  return nextEditedCells;
}

function sanitizeRowsToColumnCount(rows: string[][], columnCount: number) {
  return rows.map((row) => Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] ?? ""));
}

function areColumnsEqual(left: SheetColumn[], right: SheetColumn[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((column, columnIndex) => {
    const candidate = right[columnIndex];
    if (!candidate) {
      return false;
    }

    return (
      column.fieldName === candidate.fieldName &&
      column.type === candidate.type &&
      column.displayName === candidate.displayName &&
      column.isListType === candidate.isListType &&
      column.isReferenceType === candidate.isReferenceType &&
      JSON.stringify(column.attributes) === JSON.stringify(candidate.attributes)
    );
  });
}

function buildSheetStateFromDraft(
  currentSheetState: SheetLoadState & { data: SheetResponse },
  nextColumns: SheetColumn[],
  nextRows: string[][],
  options?: {
    nextUndoStack?: SheetHistoryEntry[];
    nextRedoStack?: SheetHistoryEntry[];
  },
) {
  const normalizedColumns = cloneColumns(nextColumns);
  const normalizedRows = sanitizeRowsToColumnCount(nextRows, normalizedColumns.length);
  const nextEditedCells = buildEditedCellsFromRows(currentSheetState.data.rows, normalizedRows, normalizedColumns.length);
  const hasColumnChanges = !areColumnsEqual(currentSheetState.data.metadata.columns, normalizedColumns);

  return {
    ...currentSheetState,
    draftColumns: normalizedColumns,
    draftRows: normalizedRows,
    editedCells: nextEditedCells,
    undoStack: options?.nextUndoStack ?? currentSheetState.undoStack ?? [],
    redoStack: options?.nextRedoStack ?? currentSheetState.redoStack ?? [],
    dirty: hasColumnChanges || Object.keys(nextEditedCells).length > 0,
  };
}

function hasLoadedSheetData(sheetState: SheetLoadState | undefined): sheetState is SheetLoadState & { data: SheetResponse } {
  return Boolean(sheetState?.data);
}

function createInsertedColumn(existingColumns: SheetColumn[], columnIndex: number): SheetColumn {
  const baseName = `NewColumn${columnIndex + 1}`;
  let fieldName = baseName;
  let suffix = 2;

  while (existingColumns.some((column) => column.fieldName === fieldName)) {
    fieldName = `${baseName}_${suffix}`;
    suffix += 1;
  }

  return {
    fieldName,
    type: "string",
    displayName: fieldName,
    isListType: false,
    isReferenceType: false,
    attributes: {
      ExportScope: "All",
    },
  };
}

function buildStructureHistoryEntry(
  previousColumns: SheetColumn[],
  previousRows: string[][],
  nextColumns: SheetColumn[],
  nextRows: string[][],
): SheetHistoryEntry {
  return {
    kind: "structure",
    previousColumns: cloneColumns(previousColumns),
    previousRows: cloneRows(previousRows),
    nextColumns: cloneColumns(nextColumns),
    nextRows: cloneRows(nextRows),
  };
}

function buildReadySheetState(data: SheetResponse): SheetLoadState {
  return {
    status: "ready",
    data,
    draftColumns: cloneColumns(data.metadata.columns),
    draftRows: cloneRows(data.rows),
    editedCells: {},
    undoStack: [],
    redoStack: [],
    dirty: false,
  };
}

async function fetchWorkspaceData(currentHostInfo: DesktopHostInfo, workspacePath: string) {
  const query = new URLSearchParams({ workspacePath });
  const [data, headerPropertyResponse, typeMetadata] = await Promise.all([
    fetchJson<WorkspaceNavigationResponse>(
      `${currentHostInfo.desktopHostUrl}/api/workspace/navigation?${query.toString()}`,
    ),
    fetchJson<{ properties: HeaderPropertySchema[] }>(
      `${currentHostInfo.desktopHostUrl}/api/workspace/header-properties?${query.toString()}`,
    ),
    fetchJson<TypeMetadataResponse>(
      `${currentHostInfo.desktopHostUrl}/api/workspace/type-metadata?${query.toString()}`,
    ),
  ]);

  return {
    workspace: data,
    headerPropertySchemas: headerPropertyResponse.properties,
    typeMetadata,
  };
}

async function fetchSheetData(currentHostInfo: DesktopHostInfo, workspacePath: string, tab: SheetTab) {
  const query = new URLSearchParams({ workspacePath });
  const workbookName = encodeURIComponent(tab.workbookName);
  const sheetName = encodeURIComponent(tab.sheetName);

  return fetchJson<SheetResponse>(
    `${currentHostInfo.desktopHostUrl}/api/workspace/workbooks/${workbookName}/sheets/${sheetName}?${query.toString()}`,
  );
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
      kind: "activate-workbook" | "open-directory";
      workbookName?: string;
      directoryPath?: string;
    };
  }) => void;
};

export function useWorkspaceEditor({ hostInfo, onToast }: UseWorkspaceEditorArgs) {
  const [workspacePath, setWorkspacePath] = useState<string>(() => localStorage.getItem(workspaceStorageKey) ?? "");
  const [workspace, setWorkspace] = useState<WorkspaceNavigationResponse | null>(null);
  const [headerPropertySchemas, setHeaderPropertySchemas] = useState<HeaderPropertySchema[]>([]);
  const [typeMetadata, setTypeMetadata] = useState<TypeMetadataResponse | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const [sheetReloadKey, setSheetReloadKey] = useState(0);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [openTabs, setOpenTabs] = useState<SheetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sheetStateMap, setSheetStateMap] = useState<Record<string, SheetLoadState>>({});
  const [workbookSaveStateMap, setWorkbookSaveStateMap] = useState<Record<string, WorkbookSaveState>>({});
  const [sheetFilter, setSheetFilter] = useState("");
  const [externalRefreshVersion, setExternalRefreshVersion] = useState(0);
  const restoredWorkspacePathRef = useRef<string | null>(null);
  const isExternalRefreshRunningRef = useRef(false);
  const hasPendingExternalRefreshRef = useRef(false);

  const hasDirtyChanges = useMemo(
    () => Object.values(sheetStateMap).some((sheetState) => sheetState.dirty),
    [sheetStateMap],
  );
  const emitToast = useEffectEvent(onToast);
  const refreshWorkspaceFromExternalChange = useEffectEvent(async () => {
    if (!hostInfo || !workspacePath) {
      return;
    }

    if (isExternalRefreshRunningRef.current) {
      hasPendingExternalRefreshRef.current = true;
      return;
    }

    isExternalRefreshRunningRef.current = true;

    try {
      do {
        hasPendingExternalRefreshRef.current = false;

        const {
          workspace: nextWorkspace,
          headerPropertySchemas: nextHeaderPropertySchemas,
          typeMetadata: nextTypeMetadata,
        } = await fetchWorkspaceData(hostInfo, workspacePath);
        const nextOpenTabs = openTabs.filter((tab) => isSheetAvailable(nextWorkspace, tab));
        const nextActiveTabId = nextOpenTabs.some((tab) => tab.id === activeTabId)
          ? activeTabId
          : nextOpenTabs[0]?.id ?? null;

        setWorkspace(nextWorkspace);
        setHeaderPropertySchemas(nextHeaderPropertySchemas);
        setTypeMetadata(nextTypeMetadata);
        setWorkspaceStatus("ready");
        setWorkspaceError(null);
        setOpenTabs(nextOpenTabs);
        setActiveTabId(nextActiveTabId);
        setWorkbookSaveStateMap({});

        if (nextOpenTabs.length === 0) {
          setSheetStateMap({});
          continue;
        }

        const refreshedSheetResults = await Promise.all(
          nextOpenTabs.map(async (tab) => {
            try {
              const data = await fetchSheetData(hostInfo, workspacePath, tab);
              return {
                tab,
                data,
                error: null,
              };
            } catch (error) {
              return {
                tab,
                data: null,
                error: error instanceof Error ? error.message : "Sheet 读取失败。",
              };
            }
          }),
        );

        setSheetStateMap((current) => {
          const nextStateMap: Record<string, SheetLoadState> = {};

          nextOpenTabs.forEach((tab) => {
            const refreshedSheet = refreshedSheetResults.find((result) => result.tab.id === tab.id);
            if (refreshedSheet?.data) {
              nextStateMap[tab.id] = buildReadySheetState(refreshedSheet.data);
              return;
            }

            if (current[tab.id]) {
              nextStateMap[tab.id] = current[tab.id];
              return;
            }

            nextStateMap[tab.id] = {
              status: "error",
              error: refreshedSheet?.error ?? "Sheet 读取失败。",
            };
          });

          return nextStateMap;
        });

        refreshedSheetResults
          .filter((result) => result.error)
          .forEach((result) => {
            emitToast({
              title: `Sheet 重新加载失败: ${result.tab.sheetName}`,
              detail: result.error ?? "Sheet 读取失败。",
              source: "sheet",
              variant: "error",
              canOpenDetail: true,
              durationMs: 8000,
            });
          });

        setExternalRefreshVersion((current) => current + 1);
      } while (hasPendingExternalRefreshRef.current);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "工作区刷新失败。";
      emitToast({
        title: "外部修改刷新失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    } finally {
      isExternalRefreshRunningRef.current = false;
    }
  });

  useEffect(() => {
    const desktopBridge = window.lightyDesign;
    if (!desktopBridge) {
      return;
    }

    if (!workspacePath) {
      void desktopBridge.setWorkspaceWatchPath(null);
      return;
    }

    let disposed = false;
    void desktopBridge.setWorkspaceWatchPath(workspacePath);

    const unsubscribe = desktopBridge.onWorkspaceFilesChanged((event) => {
      if (disposed || event.workspacePath !== workspacePath) {
        return;
      }

      if (hasDirtyChanges) {
        emitToast({
          title: "检测到外部修改",
          detail: "当前存在未保存更改，已跳过自动刷新，避免覆盖本地编辑。",
          source: "system",
          variant: "error",
          canOpenDetail: false,
          durationMs: 4500,
        });
        return;
      }

      void refreshWorkspaceFromExternalChange();
    });

    return () => {
      disposed = true;
      unsubscribe();
      void desktopBridge.setWorkspaceWatchPath(null);
    };
  }, [emitToast, hasDirtyChanges, refreshWorkspaceFromExternalChange, workspacePath]);

  useEffect(() => {
    if (!workspacePath) {
      localStorage.removeItem(workspaceStorageKey);
      setWorkspace(null);
      setWorkspaceStatus("idle");
      setWorkspaceError(null);
      setOpenTabs([]);
      setActiveTabId(null);
      setSheetStateMap({});
      setHeaderPropertySchemas([]);
      setTypeMetadata(null);
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
        const {
          workspace: data,
          headerPropertySchemas: nextHeaderPropertySchemas,
          typeMetadata: nextTypeMetadata,
        } = await fetchWorkspaceData(hostInfo, workspacePath);

        if (canceled) {
          return;
        }

        setWorkspace(data);
        setHeaderPropertySchemas(nextHeaderPropertySchemas);
        setTypeMetadata(nextTypeMetadata);
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
        setHeaderPropertySchemas([]);
        setTypeMetadata(null);
        setWorkspaceStatus("error");
        setWorkspaceError(errorMessage);
        emitToast({
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
  }, [hostInfo, workspacePath, workspaceReloadKey]);

  useEffect(() => {
    if (!workspacePath || !workspace || workspaceStatus !== "ready") {
      return;
    }

    if (restoredWorkspacePathRef.current === workspacePath) {
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
    restoredWorkspacePathRef.current = workspacePath;
  }, [workspace, workspacePath, workspaceStatus]);

  useEffect(() => {
    if (!workspacePath) {
      restoredWorkspacePathRef.current = null;
    }
  }, [workspacePath]);

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
        const data = await fetchSheetData(currentHostInfo, workspacePath, activeTabToLoad);

        if (canceled) {
          return;
        }

        setSheetStateMap((current) => ({
          ...current,
          [activeTabToLoad.id]: buildReadySheetState(data),
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
        emitToast({
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
  }, [activeTabId, hostInfo, openTabs, sheetReloadKey, workspacePath]);

  const workbookTree = useMemo<WorkspaceTreeWorkbook[]>(() => {
    if (!workspace) {
      return [];
    }

    const search = workspaceSearch.trim().toLocaleLowerCase();

    // Aliases are provided by the backend in the workspace navigation response
    const getWorkbookAlias = (name: string) => workspace.workbooks.find((w) => w.name === name)?.alias ?? null;
    const getSheetAlias = (workbookName: string, sheetName: string) =>
      workspace.workbooks.find((w) => w.name === workbookName)?.sheets.find((s) => s.name === sheetName)?.alias ?? null;

    return workspace.workbooks
      .map<WorkspaceTreeWorkbook | null>((workbook) => {
        const sheets = workbook.sheets
          .filter((sheet) => {
            if (!search) return true;

            const workbookAlias = String(getWorkbookAlias(workbook.name) ?? "");
            const sheetAlias = String(getSheetAlias(workbook.name, sheet.name) ?? "");

            return (
              workbook.name.toLocaleLowerCase().includes(search) ||
              workbookAlias.toLocaleLowerCase().includes(search) ||
              sheet.name.toLocaleLowerCase().includes(search) ||
              sheetAlias.toLocaleLowerCase().includes(search)
            );
          })
          .map((sheet) => ({
            workbookName: workbook.name,
            sheetName: sheet.name,
            rowCount: sheet.rowCount,
            columnCount: sheet.columnCount,
            alias: getSheetAlias(workbook.name, sheet.name),
          }));

        if (!search || workbook.name.toLocaleLowerCase().includes(search) || sheets.length > 0) {
          return {
            name: workbook.name,
            directoryPath: workbook.directoryPath,
            outputRelativePath: workspace.codegen.outputRelativePath,
            sheets,
            alias: getWorkbookAlias(workbook.name),
          };
        }

        return null;
      })
      .filter((workbook): workbook is WorkspaceTreeWorkbook => workbook !== null);
  }, [workspace, workspaceSearch]);

  // Alias persistence is handled by the backend; do not use localStorage for aliases.

  async function setWorkbookAlias(workbookName: string, alias: string | null) {
    if (!workspacePath) {
      return false;
    }
    // Persist alias to backend workbook config
    try {
      await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo?.desktopHostUrl ?? ""}/api/workspace/workbooks/${encodeURIComponent(workbookName)}/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspacePath, alias: alias ?? null }),
        },
      );

      // refresh workspace navigation
      const updated = await fetchJson<WorkspaceNavigationResponse>(`${hostInfo?.desktopHostUrl ?? ""}/api/workspace/navigation?workspacePath=${encodeURIComponent(workspacePath)}`);
      setWorkspace(updated);
      return true;
    } catch {
      // Do NOT persist aliases to localStorage; surface failure to caller.
      return false;
    }
  }

  async function setSheetAlias(workbookName: string, sheetName: string, alias: string | null) {
    if (!workspacePath) {
      return false;
    }

    try {
      await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo?.desktopHostUrl ?? ""}/api/workspace/workbooks/${encodeURIComponent(workbookName)}/sheets/${encodeURIComponent(sheetName)}/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspacePath, alias: alias ?? null }),
        },
      );

      const updated = await fetchJson<WorkspaceNavigationResponse>(`${hostInfo?.desktopHostUrl ?? ""}/api/workspace/navigation?workspacePath=${encodeURIComponent(workspacePath)}`);
      setWorkspace(updated);
      return true;
    } catch {
      // Do NOT persist aliases to localStorage; surface failure to caller.
      return false;
    }
  }

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeSheetState = activeTab ? sheetStateMap[activeTab.id] : undefined;
  const activeSheetData = activeSheetState?.data;
  const activeSheetColumns = activeSheetState?.draftColumns ?? activeSheetData?.metadata.columns ?? [];
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
    window.lightyDesign?.setHasDirtyChanges(hasDirtyChanges);
  }, [hasDirtyChanges]);

  useEffect(() => {
    if (window.lightyDesign || !hasDirtyChanges) {
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

  function closeAllTabs() {
    const dirtyTabs = getDirtyTabs(openTabs, sheetStateMap);
    if (dirtyTabs.length > 0) {
      const shouldClose = window.confirm(`当前有 ${dirtyTabs.length} 个表格存在未保存修改，确认全部关闭吗？`);
      if (!shouldClose) {
        return false;
      }
    }

    setOpenTabs([]);
    setActiveTabId(null);
    setSheetStateMap({});
    setSheetFilter("");
    return true;
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
      emitToast({
        title: "无法选择工作区目录",
        detail: errorMessage,
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
    }
  }

  function closeWorkspace() {
    if (hasDirtyChanges) {
      const shouldClose = window.confirm("当前存在未保存修改，确认关闭当前工作区吗？");
      if (!shouldClose) {
        return false;
      }
    }

    setWorkspacePath("");
    setWorkspaceSearch("");
    return true;
  }

  async function chooseParentDirectoryForWorkspaceCreation() {
    if (hasDirtyChanges) {
      const shouldSwitch = window.confirm("当前存在未保存修改，确认新建并切换工作区目录吗？");
      if (!shouldSwitch) {
        return null;
      }
    }

    try {
      return await getDesktopBridge().chooseWorkspaceDirectory();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "创建工作区失败。";
      emitToast({
        title: "无法选择新工作区父目录",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return null;
    }
  }

  async function createWorkspace(parentDirectoryPath: string, workspaceName: string) {
    if (!hostInfo) {
      emitToast({
        title: "无法新建工作区",
        detail: "DesktopHost 尚未连接，当前无法创建工作区。",
        source: "system",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }

    const trimmedWorkspaceName = workspaceName.trim();
    if (!isValidWorkspaceName(trimmedWorkspaceName)) {
      emitToast({
        title: "工作区名称无效",
        detail: "工作区名称不能为空，且不能包含 \\ / : * ? \" < > | 等非法字符。",
        source: "system",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const createdWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parentDirectoryPath,
            workspaceName: trimmedWorkspaceName,
          }),
        },
      );

      setWorkspacePath(createdWorkspace.rootPath);
      setWorkspaceSearch("");
      emitToast({
        title: `工作区已创建: ${trimmedWorkspaceName}`,
        detail: `已在 ${parentDirectoryPath} 下创建新工作区，并复制完整工作区模板内容。`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "创建工作区失败。";
      emitToast({
        title: "创建工作区失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function createWorkbook(workbookName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法新建工作簿",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const trimmedWorkbookName = workbookName.trim();
    if (!isValidWorkspaceName(trimmedWorkbookName)) {
      emitToast({
        title: "工作簿名称无效",
        detail: "工作簿名称不能为空，且不能包含 \\ / : * ? \" < > | 等非法字符。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName: trimmedWorkbookName,
          }),
        },
      );

      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      setWorkbookSaveStateMap({});
      setSheetFilter("");

      const defaultSheetTabId = buildSheetTabId(trimmedWorkbookName, defaultWorkbookSheetName);
      setOpenTabs((current) => {
        if (current.some((tab) => tab.id === defaultSheetTabId)) {
          return current;
        }

        return [...current, { id: defaultSheetTabId, workbookName: trimmedWorkbookName, sheetName: defaultWorkbookSheetName }];
      });
      setActiveTabId(defaultSheetTabId);
      setSheetStateMap((current) => ({
        ...current,
        [defaultSheetTabId]: current[defaultSheetTabId] ?? { status: "idle" },
      }));

      emitToast({
        title: `工作簿已创建: ${trimmedWorkbookName}`,
        detail: "已创建默认 Sheet，并初始化 ID 与 Annotation 两列。",
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "创建工作簿失败。";
      emitToast({
        title: "创建工作簿失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function deleteWorkbook(workbookName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法删除工作簿",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const shouldDelete = window.confirm(`确认删除工作簿 ${workbookName} 吗？该操作不会进入撤销/重做。`);
    if (!shouldDelete) {
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
          }),
        },
      );

      const nextOpenTabs = removeWorkbookTabs(openTabs, workbookName);
      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      setOpenTabs(nextOpenTabs);
      setActiveTabId((current) => {
        if (!current) {
          return nextOpenTabs[0]?.id ?? null;
        }

        const currentTabStillExists = nextOpenTabs.some((tab) => tab.id === current);
        return currentTabStillExists ? current : nextOpenTabs[0]?.id ?? null;
      });
      setSheetStateMap((current) => {
        const nextStateMap: Record<string, SheetLoadState> = {};
        nextOpenTabs.forEach((tab) => {
          if (current[tab.id]) {
            nextStateMap[tab.id] = current[tab.id];
          }
        });
        return nextStateMap;
      });
      setWorkbookSaveStateMap((current) => {
        const nextStateMap = { ...current };
        delete nextStateMap[workbookName];
        return nextStateMap;
      });
      setSheetFilter("");

      emitToast({
        title: `工作簿已删除: ${workbookName}`,
        detail: "已从当前工作区移除该工作簿目录。",
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "删除工作簿失败。";
      emitToast({
        title: "删除工作簿失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function createSheet(workbookName: string, sheetName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法新建 Sheet",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const trimmedSheetName = sheetName.trim();
    if (!isValidWorkspaceName(trimmedSheetName)) {
      emitToast({
        title: "Sheet 名称无效",
        detail: "Sheet 名称不能为空，且不能包含 \\ / : * ? \" < > | 等非法字符。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/sheets/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
            sheetName: trimmedSheetName,
          }),
        },
      );

      const tabId = buildSheetTabId(workbookName, trimmedSheetName);
      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      setOpenTabs((current) => {
        if (current.some((tab) => tab.id === tabId)) {
          return current;
        }

        return [...current, { id: tabId, workbookName, sheetName: trimmedSheetName }];
      });
      setActiveTabId(tabId);
      setSheetStateMap((current) => ({
        ...current,
        [tabId]: current[tabId] ?? { status: "idle" },
      }));
      setSheetFilter("");

      emitToast({
        title: `Sheet 已创建: ${trimmedSheetName}`,
        detail: `已在工作簿 ${workbookName} 下创建新 Sheet，并初始化默认列。`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "创建 Sheet 失败。";
      emitToast({
        title: "创建 Sheet 失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function deleteSheet(workbookName: string, sheetName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法删除 Sheet",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const shouldDelete = window.confirm(`确认删除 Sheet ${workbookName} / ${sheetName} 吗？该操作不会进入撤销/重做。`);
    if (!shouldDelete) {
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/sheets/delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
            sheetName,
          }),
        },
      );

      const nextOpenTabs = removeSheetTabs(openTabs, workbookName, sheetName);
      const deletedTabIds = openTabs
        .filter((tab) => tab.workbookName === workbookName && tab.sheetName === sheetName)
        .map((tab) => tab.id);

      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      setOpenTabs(nextOpenTabs);
      setActiveTabId((current) => {
        if (!current || !deletedTabIds.includes(current)) {
          return current && nextOpenTabs.some((tab) => tab.id === current) ? current : nextOpenTabs[0]?.id ?? null;
        }

        return nextOpenTabs[0]?.id ?? null;
      });
      setSheetStateMap((current) => {
        const nextStateMap = { ...current };
        deletedTabIds.forEach((tabId) => {
          delete nextStateMap[tabId];
        });
        return nextStateMap;
      });
      setSheetFilter("");

      emitToast({
        title: `Sheet 已删除: ${sheetName}`,
        detail: `已从工作簿 ${workbookName} 中移除该 Sheet。`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "删除 Sheet 失败。";
      emitToast({
        title: "删除 Sheet 失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function renameSheet(workbookName: string, sheetName: string, newSheetName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法重命名 Sheet",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const trimmedSheetName = newSheetName.trim();
    if (!isValidWorkspaceName(trimmedSheetName)) {
      emitToast({
        title: "Sheet 名称无效",
        detail: "Sheet 名称不能为空，且不能包含 \\ / : * ? \" < > | 等非法字符。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    if (trimmedSheetName === sheetName) {
      emitToast({
        title: "Sheet 名称未变化",
        detail: "请输入一个不同的新名称。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 5000,
      });
      return false;
    }

    const hasDirtySheet = openTabs.some(
      (tab) => tab.workbookName === workbookName && tab.sheetName === sheetName && sheetStateMap[tab.id]?.dirty,
    );
    if (hasDirtySheet) {
      emitToast({
        title: "无法重命名 Sheet",
        detail: "该 Sheet 存在未保存修改，请先保存或还原后再重命名。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/sheets/rename`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
            sheetName,
            newSheetName: trimmedSheetName,
          }),
        },
      );

      const renamedTabs = renameSheetTabs(openTabs, workbookName, sheetName, trimmedSheetName);
      const oldTabIds = openTabs
        .filter((tab) => tab.workbookName === workbookName && tab.sheetName === sheetName)
        .map((tab) => tab.id);
      const newTabIds = renamedTabs
        .filter((tab) => tab.workbookName === workbookName && tab.sheetName === trimmedSheetName)
        .map((tab) => tab.id);

      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      setOpenTabs(renamedTabs);
      setActiveTabId((current) => {
        if (!current || !oldTabIds.includes(current)) {
          return current;
        }

        return newTabIds[0] ?? current;
      });
      setSheetStateMap((current) => {
        const nextStateMap = { ...current };
        oldTabIds.forEach((tabId) => {
          delete nextStateMap[tabId];
        });
        newTabIds.forEach((tabId) => {
          nextStateMap[tabId] = { status: "idle" };
        });
        return nextStateMap;
      });
      setSheetFilter("");

      emitToast({
        title: `Sheet 已重命名: ${sheetName}`,
        detail: `已重命名为 ${trimmedSheetName}。`,
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "重命名 Sheet 失败。";
      emitToast({
        title: "重命名 Sheet 失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function saveWorkspaceCodegenOptions(
    outputRelativePath: string,
    options?: {
      i18nOutputRelativePath?: string | null;
      i18nSourceLanguage?: string | null;
    },
  ) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法保存代码生成配置",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const updatedWorkspace = await fetchJson<WorkspaceNavigationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/codegen/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            outputRelativePath,
            i18nOutputRelativePath: options?.i18nOutputRelativePath ?? null,
            i18nSourceLanguage: options?.i18nSourceLanguage ?? null,
          }),
        },
      );

      setWorkspace(updatedWorkspace);
      setWorkspaceStatus("ready");
      setWorkspaceError(null);
      emitToast({
        title: "代码生成配置已保存",
        detail: outputRelativePath.trim() ? `输出相对路径: ${outputRelativePath.trim()}` : "已清空输出相对路径。",
        source: "workspace",
        variant: "success",
        canOpenDetail: false,
        durationMs: 3200,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "保存代码生成配置失败。";
      emitToast({
        title: "保存代码生成配置失败",
        detail: errorMessage,
        source: "workspace",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function exportWorkbookCode(workbookName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法导出代码",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const hasDirtyWorkbookTabs = openTabs.some((tab) => tab.workbookName === workbookName && sheetStateMap[tab.id]?.dirty);
    if (hasDirtyWorkbookTabs) {
      emitToast({
        title: "无法导出代码",
        detail: "该工作簿存在未保存修改。请先保存相关 Sheet 后再导出代码。",
        source: "save",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const result = await fetchJson<WorkbookCodegenExportResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/codegen/export`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
          }),
        },
      );

      emitToast({
        title: `代码导出成功: ${workbookName}`,
        detail: `已输出 ${result.fileCount} 个文件到 ${result.outputDirectoryPath}。`,
        source: "save",
        variant: "success",
        canOpenDetail: false,
        durationMs: 5000,
        action: {
          label: "打开输出目录",
          kind: "open-directory",
          directoryPath: result.outputDirectoryPath,
        },
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "导出代码失败。";
      emitToast({
        title: "导出代码失败",
        detail: errorMessage,
        source: "save",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function validateWorkbookCode(workbookName: string) {
    if (!hostInfo || !workspacePath) {
      emitToast({
        title: "无法校验工作簿",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const result = await fetchJson<WorkbookValidationResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/codegen/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
            workbookName,
          }),
        },
      );

      emitToast({
        title: `校验通过: ${result.workbookName}`,
        detail: "当前工作簿未发现校验错误。",
        source: "save",
        variant: "success",
        canOpenDetail: false,
        durationMs: 4000,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "校验工作簿失败。";
      emitToast({
        title: "校验工作簿失败",
        detail: errorMessage,
        source: "save",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }
  }

  async function exportAllWorkbookCode() {
    if (!hostInfo || !workspacePath || !workspace) {
      emitToast({
        title: "无法导出代码",
        detail: "请先选择一个有效工作区。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    if (workspace.workbooks.length === 0) {
      emitToast({
        title: "无法导出代码",
        detail: "当前工作区没有可导出的工作簿。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    if (!workspace.codegen.outputRelativePath?.trim()) {
      emitToast({
        title: "无法导出全部代码",
        detail: "当前工作区尚未配置代码导出路径。",
        source: "workspace",
        variant: "error",
        canOpenDetail: false,
        durationMs: 8000,
      });
      return false;
    }

    const dirtyWorkbookNames = Array.from(new Set(getDirtyTabs(openTabs, sheetStateMap).map((tab) => tab.workbookName)));
    if (dirtyWorkbookNames.length > 0) {
      emitToast({
        title: "无法导出全部代码",
        detail: `以下工作簿存在未保存修改：${dirtyWorkbookNames.join("、")}。请先保存后再导出。`,
        source: "save",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
    }

    try {
      const result = await fetchJson<WorkbookCodegenExportResponse>(
        `${hostInfo.desktopHostUrl}/api/workspace/workbooks/codegen/export-all`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspacePath,
          }),
        },
      );

      const exportedWorkbookCount = result.workbookCount ?? workspace.workbooks.length;
      emitToast({
        title: "全部工作簿代码导出成功",
        detail: `已导出 ${exportedWorkbookCount} 个工作簿，共生成 ${result.fileCount} 个文件到 ${result.outputDirectoryPath}。`,
        source: "save",
        variant: "success",
        canOpenDetail: false,
        durationMs: 5000,
        action: {
          label: "打开输出目录",
          kind: "open-directory",
          directoryPath: result.outputDirectoryPath,
        },
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "导出全部代码失败。";
      emitToast({
        title: "导出全部代码失败",
        detail: errorMessage,
        source: "save",
        variant: "error",
        canOpenDetail: true,
        durationMs: 8000,
      });
      return false;
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
    setSheetReloadKey((current) => current + 1);
  }

  function applyCellEdits(editInputs: CellEditInput[]) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    const currentDraftRows = activeSheetState.draftRows ?? activeSheetState.data.rows;
    const normalizedEdits = editInputs
      .map<CellEditRecord>((edit) => ({
        rowIndex: edit.rowIndex,
        columnIndex: edit.columnIndex,
        previousValue: currentDraftRows[edit.rowIndex]?.[edit.columnIndex] ?? "",
        nextValue: edit.nextValue,
      }))
      .filter((edit) => edit.previousValue !== edit.nextValue);

    if (normalizedEdits.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;

      const nextDraftRows = applyEditsToRows(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        normalizedEdits.map((edit) => ({
          rowIndex: edit.rowIndex,
          columnIndex: edit.columnIndex,
          value: edit.nextValue,
        })),
      );

      const nextEditedCells = {
        ...(currentSheetState.editedCells ?? {}),
      };

      normalizedEdits.forEach((edit) => {
        const originalValue = currentSheetState.data?.rows[edit.rowIndex]?.[edit.columnIndex] ?? "";
        const cellKey = buildCellKey(edit.rowIndex, edit.columnIndex);

        if (edit.nextValue === originalValue) {
          delete nextEditedCells[cellKey];
        } else {
          nextEditedCells[cellKey] = edit.nextValue;
        }
      });

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(
            currentSheetState,
            currentColumns,
            nextDraftRows,
            {
              nextUndoStack: [
                ...(currentSheetState.undoStack ?? []),
                {
                  kind: "cell-batch",
                  edits: normalizedEdits,
                },
              ],
              nextRedoStack: [],
            },
          ),
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

  function updateCellValue(rowIndex: number, columnIndex: number, nextValue: string) {
    applyCellEdits([{ rowIndex, columnIndex, nextValue }]);
  }

  function insertRow(atRowIndex: number) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const nextRowIndex = Math.max(0, Math.min(atRowIndex, normalizedRows.length));
      const nextDraftRows = [...normalizedRows];
      nextDraftRows.splice(nextRowIndex, 0, Array.from({ length: currentColumns.length }, () => ""));
      const historyEntry = buildStructureHistoryEntry(currentColumns, normalizedRows, currentColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function deleteRow(rowIndex: number) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      if (rowIndex < 0 || rowIndex >= normalizedRows.length) {
        return current;
      }

      const nextDraftRows = [...normalizedRows];
      nextDraftRows.splice(rowIndex, 1);
      const historyEntry = buildStructureHistoryEntry(currentColumns, normalizedRows, currentColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function deleteRows(rowIndices: number[]) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    const normalizedRowIndices = Array.from(
      new Set(
        rowIndices
          .filter((rowIndex) => Number.isInteger(rowIndex))
          .map((rowIndex) => Math.trunc(rowIndex)),
      ),
    ).sort((left, right) => left - right);

    if (normalizedRowIndices.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const validRowIndexSet = new Set(
        normalizedRowIndices.filter((rowIndex) => rowIndex >= 0 && rowIndex < normalizedRows.length),
      );

      if (validRowIndexSet.size === 0) {
        return current;
      }

      const nextDraftRows = normalizedRows.filter((_, currentRowIndex) => !validRowIndexSet.has(currentRowIndex));
      const historyEntry = buildStructureHistoryEntry(currentColumns, normalizedRows, currentColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function insertColumn(atColumnIndex: number) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = cloneColumns(currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns);
      const nextColumnIndex = Math.max(0, Math.min(atColumnIndex, currentColumns.length));
      currentColumns.splice(nextColumnIndex, 0, createInsertedColumn(currentColumns, nextColumnIndex));
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length - 1,
      );
      const nextDraftRows = normalizedRows.map((row) => {
        const nextRow = [...row];
        nextRow.splice(nextColumnIndex, 0, "");
        return nextRow;
      });
      const historyEntry = buildStructureHistoryEntry(
        currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns,
        normalizedRows,
        currentColumns,
        nextDraftRows,
      );

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function deleteColumn(columnIndex: number) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = cloneColumns(currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns);
      if (columnIndex < 0 || columnIndex >= currentColumns.length || currentColumns.length <= 1) {
        return current;
      }

      currentColumns.splice(columnIndex, 1);
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length + 1,
      );
      const nextDraftRows = normalizedRows.map((row) => row.filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex));
      const historyEntry = buildStructureHistoryEntry(
        currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns,
        normalizedRows,
        currentColumns,
        nextDraftRows,
      );

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function deleteColumns(columnIndices: number[]) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    const normalizedColumnIndices = Array.from(
      new Set(
        columnIndices
          .filter((columnIndex) => Number.isInteger(columnIndex))
          .map((columnIndex) => Math.trunc(columnIndex)),
      ),
    ).sort((left, right) => left - right);

    if (normalizedColumnIndices.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = cloneColumns(currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns);
      const validColumnIndices = normalizedColumnIndices.filter(
        (columnIndex) => columnIndex >= 0 && columnIndex < currentColumns.length,
      );
      const validColumnIndexSet = new Set(validColumnIndices);

      if (validColumnIndexSet.size === 0 || currentColumns.length - validColumnIndexSet.size <= 0) {
        return current;
      }

      const nextColumns = currentColumns.filter((_, currentColumnIndex) => !validColumnIndexSet.has(currentColumnIndex));
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const nextDraftRows = normalizedRows.map((row) => row.filter((_, currentColumnIndex) => !validColumnIndexSet.has(currentColumnIndex)));
      const historyEntry = buildStructureHistoryEntry(
        currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns,
        normalizedRows,
        nextColumns,
        nextDraftRows,
      );

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, nextColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function updateColumnDefinition(columnIndex: number, nextColumn: SheetColumn) {
    if (!activeTab || !activeSheetState?.data) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = cloneColumns(currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns);
      if (columnIndex < 0 || columnIndex >= currentColumns.length) {
        return current;
      }

      const previousColumns = cloneColumns(currentColumns);
      const normalizedColumn = normalizeSheetColumnForSave(nextColumn);
      currentColumns[columnIndex] = {
        ...normalizedColumn,
        attributes: { ...normalizedColumn.attributes },
      };

      if (areColumnsEqual(previousColumns, currentColumns)) {
        return current;
      }

      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const historyEntry = buildStructureHistoryEntry(previousColumns, normalizedRows, currentColumns, normalizedRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, normalizedRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function insertCopiedRows(atRowIndex: number, copiedRows: string[][]) {
    if (!activeTab || !activeSheetState?.data || copiedRows.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;
      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const nextRowIndex = Math.max(0, Math.min(atRowIndex, normalizedRows.length));
      const nextCopiedRows = sanitizeRowsToColumnCount(copiedRows, currentColumns.length);
      const nextDraftRows = [...normalizedRows];
      nextDraftRows.splice(nextRowIndex, 0, ...cloneRows(nextCopiedRows));
      const historyEntry = buildStructureHistoryEntry(currentColumns, normalizedRows, currentColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function insertCopiedColumns(atColumnIndex: number, copiedColumns: SheetColumn[], copiedMatrix: string[][]) {
    if (!activeTab || !activeSheetState?.data || copiedColumns.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const previousColumns = cloneColumns(currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns);
      const nextColumnIndex = Math.max(0, Math.min(atColumnIndex, previousColumns.length));
      const insertedColumns = cloneColumns(copiedColumns);
      const nextColumns = cloneColumns(previousColumns);
      nextColumns.splice(nextColumnIndex, 0, ...insertedColumns);

      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        previousColumns.length,
      );
      const normalizedMatrix = sanitizeRowsToColumnCount(copiedMatrix, insertedColumns.length);
      const nextDraftRows = normalizedRows.map((row, rowIndex) => {
        const nextRow = [...row];
        const insertedValues = normalizedMatrix[rowIndex] ?? Array.from({ length: insertedColumns.length }, () => "");
        nextRow.splice(nextColumnIndex, 0, ...insertedValues);
        return nextRow;
      });
      const historyEntry = buildStructureHistoryEntry(previousColumns, normalizedRows, nextColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, nextColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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

  function insertCopiedCellsDown(startRowIndex: number, startColumnIndex: number, copiedMatrix: string[][]) {
    if (!activeTab || !activeSheetState?.data || copiedMatrix.length === 0) {
      return;
    }

    setSheetStateMap((current) => {
      const currentSheetState = current[activeTab.id];
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      const currentColumns = currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns;
      if (startColumnIndex < 0 || startColumnIndex >= currentColumns.length || startRowIndex < 0) {
        return current;
      }

      const normalizedRows = sanitizeRowsToColumnCount(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        currentColumns.length,
      );
      const copiedColumnCount = copiedMatrix.reduce((max, row) => Math.max(max, row.length), 0);
      if (copiedColumnCount === 0) {
        return current;
      }

      const targetColumnCount = Math.min(copiedColumnCount, currentColumns.length - startColumnIndex);
      if (targetColumnCount <= 0) {
        return current;
      }

      const normalizedMatrix = copiedMatrix.map((row) => Array.from({ length: targetColumnCount }, (_, columnIndex) => row[columnIndex] ?? ""));
      const nextRowCount = Math.max(normalizedRows.length, startRowIndex) + normalizedMatrix.length;
      const nextDraftRows = Array.from({ length: nextRowCount }, (_, rowIndex) =>
        Array.from({ length: currentColumns.length }, (_, columnIndex) => normalizedRows[rowIndex]?.[columnIndex] ?? ""),
      );

      for (let columnOffset = 0; columnOffset < targetColumnCount; columnOffset += 1) {
        const targetColumnIndex = startColumnIndex + columnOffset;

        for (let rowIndex = nextRowCount - 1; rowIndex >= startRowIndex + normalizedMatrix.length; rowIndex -= 1) {
          const sourceRowIndex = rowIndex - normalizedMatrix.length;
          nextDraftRows[rowIndex][targetColumnIndex] = normalizedRows[sourceRowIndex]?.[targetColumnIndex] ?? "";
        }

        for (let rowOffset = 0; rowOffset < normalizedMatrix.length; rowOffset += 1) {
          nextDraftRows[startRowIndex + rowOffset][targetColumnIndex] = normalizedMatrix[rowOffset]?.[columnOffset] ?? "";
        }
      }

      const historyEntry = buildStructureHistoryEntry(currentColumns, normalizedRows, currentColumns, nextDraftRows);

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentColumns, nextDraftRows, {
            nextUndoStack: [...(currentSheetState.undoStack ?? []), historyEntry],
            nextRedoStack: [],
          }),
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
      if (!hasLoadedSheetData(currentSheetState) || !currentSheetState.undoStack?.length) {
        return current;
      }

      const undoStack = [...currentSheetState.undoStack];
      const lastEdit = undoStack.pop();
      if (!lastEdit) {
        return current;
      }

      if (lastEdit.kind === "structure") {
        return {
          ...current,
          [activeTab.id]: {
            ...buildSheetStateFromDraft(currentSheetState, lastEdit.previousColumns, lastEdit.previousRows, {
              nextUndoStack: undoStack,
              nextRedoStack: [...(currentSheetState.redoStack ?? []), lastEdit],
            }),
          },
        };
      }

      const nextDraftRows = applyEditsToRows(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        lastEdit.edits.map((edit) => ({
          rowIndex: edit.rowIndex,
          columnIndex: edit.columnIndex,
          value: edit.previousValue,
        })),
      );

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(
            currentSheetState,
            currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns,
            nextDraftRows,
            {
              nextUndoStack: undoStack,
              nextRedoStack: [...(currentSheetState.redoStack ?? []), lastEdit],
            },
          ),
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
      if (!hasLoadedSheetData(currentSheetState) || !currentSheetState.redoStack?.length) {
        return current;
      }

      const redoStack = [...currentSheetState.redoStack];
      const lastRedo = redoStack.pop();
      if (!lastRedo) {
        return current;
      }

      if (lastRedo.kind === "structure") {
        return {
          ...current,
          [activeTab.id]: {
            ...buildSheetStateFromDraft(currentSheetState, lastRedo.nextColumns, lastRedo.nextRows, {
              nextUndoStack: [...(currentSheetState.undoStack ?? []), lastRedo],
              nextRedoStack: redoStack,
            }),
          },
        };
      }

      const nextDraftRows = applyEditsToRows(
        currentSheetState.draftRows ?? currentSheetState.data.rows,
        lastRedo.edits.map((edit) => ({
          rowIndex: edit.rowIndex,
          columnIndex: edit.columnIndex,
          value: edit.nextValue,
        })),
      );

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(
            currentSheetState,
            currentSheetState.draftColumns ?? currentSheetState.data.metadata.columns,
            nextDraftRows,
            {
              nextUndoStack: [...(currentSheetState.undoStack ?? []), lastRedo],
              nextRedoStack: redoStack,
            },
          ),
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
      if (!hasLoadedSheetData(currentSheetState)) {
        return current;
      }

      return {
        ...current,
        [activeTab.id]: {
          ...buildSheetStateFromDraft(currentSheetState, currentSheetState.data.metadata.columns, currentSheetState.data.rows, {
            nextUndoStack: [],
            nextRedoStack: [],
          }),
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
            const columns = (dirtySheetState?.draftColumns ?? sheet.metadata.columns).map(normalizeSheetColumnForSave);

            return {
              name: sheet.metadata.name,
              columns: columns.map((column) => ({
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
              draftColumns: cloneColumns(savedSheet.metadata.columns),
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
      emitToast({
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
      emitToast({
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
    headerPropertySchemas,
    typeMetadata,
    workspaceStatus,
    workspaceError,
    workspaceSearch,
    setWorkspaceSearch,
    openTabs,
    activeTabId,
    setActiveTabId,
    sheetFilter,
    externalRefreshVersion,
    setSheetFilter,
    workbookTree,
    totalSheetCount,
    activeTab,
    activeSheetState,
    activeSheetData,
    activeSheetColumns,
    activeSheetRows,
    activeWorkbookSaveState,
    activeWorkbookDirtyTabs,
    filteredRowEntries,
    hasDirtyChanges,
    openSheet,
    closeTab,
    closeAllTabs,
    chooseParentDirectoryForWorkspaceCreation,
    createWorkspace,
    createWorkbook,
    deleteWorkbook,
    createSheet,
    deleteSheet,
    renameSheet,
    saveWorkspaceCodegenOptions,
    exportWorkbookCode,
    validateWorkbookCode,
    exportAllWorkbookCode,
    chooseWorkspaceDirectory,
    closeWorkspace,
    retryWorkspaceLoad,
    retryActiveSheetLoad,
    applyCellEdits,
    insertRow,
    deleteRow,
    deleteRows,
    insertColumn,
    deleteColumn,
    deleteColumns,
    insertCopiedRows,
    insertCopiedColumns,
    insertCopiedCellsDown,
    updateColumnDefinition,
    updateCellValue,
    activateWorkbook,
    undoActiveSheetEdit,
    redoActiveSheetEdit,
    restoreActiveSheetDraft,
    saveActiveWorkbook,
    setWorkbookAlias,
    setSheetAlias,
  };
}



