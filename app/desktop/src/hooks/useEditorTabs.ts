import { useCallback, useMemo, useState } from "react";
import type { SheetTab } from "../workbook-editor/types/desktopApp";
import type { EditorTabInfo, FlowChartTabInfo } from "../types/editorTabs";
import {
  buildFlowChartTabId,
  convertSheetTabToInfo,
  isSheetTabInfo,
  buildTabPersistenceKey,
} from "../types/editorTabs";

export type UseEditorTabsOptions = {
  workspacePath: string | null;
  /** Current sheet tabs managed by useWorkspaceEditor. */
  sheetTabs: SheetTab[];
  activeSheetTabId: string | null;
  onActivateSheetTab: (tabId: string) => void;
  onCloseSheetTab: (tabId: string) => void;
};

export type UseEditorTabsResult = {
  /** All open tabs (sheet + flowchart), ordered left to right. */
  tabs: EditorTabInfo[];
  /** Currently active tab ID, or null. */
  activeTabId: string | null;
  /** Open (or switch to) a flowchart tab. */
  openFlowChartTab: (relativePath: string, name: string) => void;
  /** Close a tab by ID. */
  closeTab: (tabId: string) => void;
  /** Activate a tab by ID. */
  activateTab: (tabId: string) => void;
};

const STORAGE_KEY_SUFFIX = ":flowchartTabs";

function loadPersistedFlowChartTabs(workspacePath: string): FlowChartTabInfo[] {
  try {
    const key = buildTabPersistenceKey(workspacePath) + STORAGE_KEY_SUFFIX;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is FlowChartTabInfo =>
        typeof x === "object" && x !== null && (x as FlowChartTabInfo).kind === "flowchart",
    );
  } catch {
    return [];
  }
}

function persistFlowChartTabs(workspacePath: string, tabs: FlowChartTabInfo[]) {
  try {
    const key = buildTabPersistenceKey(workspacePath) + STORAGE_KEY_SUFFIX;
    localStorage.setItem(key, JSON.stringify(tabs));
  } catch {
    // localStorage may be full or unavailable — silently ignore.
  }
}

export function useEditorTabs(options: UseEditorTabsOptions): UseEditorTabsResult {
  const { workspacePath, sheetTabs, activeSheetTabId, onActivateSheetTab, onCloseSheetTab } = options;

  // FlowChart open tabs (managed locally).
  const [flowChartTabs, setFlowChartTabs] = useState<FlowChartTabInfo[]>(() =>
    workspacePath ? loadPersistedFlowChartTabs(workspacePath) : [],
  );
  const [activeFlowChartTabId, setActiveFlowChartTabId] = useState<string | null>(null);

  // Merge sheet tabs and flowchart tabs into a single ordered list.
  const tabs = useMemo<EditorTabInfo[]>(() => {
    const sheetTabInfos: EditorTabInfo[] = sheetTabs.map(convertSheetTabToInfo);
    return [...sheetTabInfos, ...flowChartTabs];
  }, [sheetTabs, flowChartTabs]);

  // Determine the active tab ID.
  const activeTabId = useMemo<string | null>(() => {
    if (activeSheetTabId) return activeSheetTabId;
    if (activeFlowChartTabId) return activeFlowChartTabId;
    if (tabs.length > 0) return tabs[0].id;
    return null;
  }, [activeSheetTabId, activeFlowChartTabId, tabs]);

  // ── Actions ──

  const openFlowChartTab = useCallback(
    (relativePath: string, name: string) => {
      const id = buildFlowChartTabId(relativePath);
      setFlowChartTabs((prev) => {
        const exists = prev.some((t) => t.id === id);
        if (exists) return prev;
        const next = [...prev, { kind: "flowchart" as const, id, relativePath, name }];
        if (workspacePath) persistFlowChartTabs(workspacePath, next);
        return next;
      });
      setActiveFlowChartTabId(id);
    },
    [workspacePath],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      // Try sheet tab first.
      const sheetTab = sheetTabs.find((t) => t.id === tabId);
      if (sheetTab) {
        onCloseSheetTab(tabId);
        return;
      }
      // Otherwise close flowchart tab.
      setFlowChartTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        if (workspacePath) persistFlowChartTabs(workspacePath, next);
        return next;
      });
      if (activeFlowChartTabId === tabId) {
        setActiveFlowChartTabId(null);
      }
    },
    [sheetTabs, activeFlowChartTabId, onCloseSheetTab, workspacePath],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const sheetTab = sheetTabs.find((t) => t.id === tabId);
      if (sheetTab) {
        setActiveFlowChartTabId(null);
        onActivateSheetTab(tabId);
      } else {
        setActiveFlowChartTabId(tabId);
      }
    },
    [sheetTabs, onActivateSheetTab],
  );

  return { tabs, activeTabId, openFlowChartTab, closeTab, activateTab };
}
