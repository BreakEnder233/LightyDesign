import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** Reorder tabs: move tabId to before/after targetId. */
  reorderTabs: (sourceId: string, targetId: string, position: "before" | "after") => void;
  /** Close all open tabs. */
  closeAllTabs: () => void;
  /** Close all tabs to the right of the given tabId. */
  closeTabsToRight: (tabId: string) => void;
  /** Close all tabs except the given tabId. */
  closeOtherTabs: (tabId: string) => void;
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

  const TAB_ORDER_SUFFIX = ":tabOrder";

  function loadTabOrder(workspacePath: string): string[] {
    try {
      const key = buildTabPersistenceKey(workspacePath) + TAB_ORDER_SUFFIX;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      return [];
    }
  }

  function persistTabOrder(workspacePath: string, order: string[]) {
    try {
      const key = buildTabPersistenceKey(workspacePath) + TAB_ORDER_SUFFIX;
      localStorage.setItem(key, JSON.stringify(order));
    } catch {
      // silently ignore
    }
  }

  const [tabOrder, setTabOrder] = useState<string[]>(() =>
    workspacePath ? loadTabOrder(workspacePath) : [],
  );

  // When workspacePath changes (workspace switch), reload flowchart tabs for the new workspace.
  useEffect(() => {
    if (workspacePath) {
      setFlowChartTabs(loadPersistedFlowChartTabs(workspacePath));
      setTabOrder(loadTabOrder(workspacePath));
    } else {
      setFlowChartTabs([]);
      setTabOrder([]);
    }
    setActiveFlowChartTabId(null);
  }, [workspacePath]);

  // Merge sheet tabs and flowchart tabs into a single ordered list.
  const tabs = useMemo<EditorTabInfo[]>(() => {
    const allTabs: EditorTabInfo[] = [
      ...sheetTabs.map(convertSheetTabToInfo),
      ...flowChartTabs,
    ];

    if (tabOrder.length === 0) {
      return allTabs;
    }

    // Build id->tab map for fast lookup
    const tabMap = new Map<string, EditorTabInfo>();
    for (const tab of allTabs) {
      tabMap.set(tab.id, tab);
    }

    // Sort by persisted tabOrder, append any new tabs not in the order
    const ordered: EditorTabInfo[] = [];
    for (const id of tabOrder) {
      const tab = tabMap.get(id);
      if (tab) {
        ordered.push(tab);
        tabMap.delete(id);
      }
    }
    // Append any remaining tabs that weren't in the persisted order (newly opened)
    for (const tab of tabMap.values()) {
      ordered.push(tab);
    }

    return ordered;
  }, [sheetTabs, flowChartTabs, tabOrder]);

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

      // Insert into tabOrder to the right of active tab
      setTabOrder((prev) => {
        if (prev.includes(id)) return prev; // already present (opened via sheet tab)
        const activePos = prev.indexOf(activeTabId ?? "");
        if (activePos >= 0) {
          const next = [...prev];
          next.splice(activePos + 1, 0, id);
          if (workspacePath) persistTabOrder(workspacePath, next);
          return next;
        }
        // No active tab or not found: append
        const next = [...prev, id];
        if (workspacePath) persistTabOrder(workspacePath, next);
        return next;
      });

      setActiveFlowChartTabId(id);
    },
    [workspacePath, activeTabId],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      // Try sheet tab first.
      const sheetTab = sheetTabs.find((t) => t.id === tabId);
      if (sheetTab) {
        onCloseSheetTab(tabId);
        // Remove from tabOrder
        setTabOrder((prev) => {
          const next = prev.filter((id) => id !== tabId);
          if (workspacePath) persistTabOrder(workspacePath, next);
          return next;
        });
        return;
      }
      // Otherwise close flowchart tab.
      setFlowChartTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        if (workspacePath) persistFlowChartTabs(workspacePath, next);
        return next;
      });
      // Remove from tabOrder
      setTabOrder((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (workspacePath) persistTabOrder(workspacePath, next);
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

  const reorderTabs = useCallback(
    (sourceId: string, targetId: string, position: "before" | "after") => {
      setTabOrder((prev) => {
        const sourceIdx = prev.indexOf(sourceId);
        const targetIdx = prev.indexOf(targetId);
        if (sourceIdx < 0 || targetIdx < 0) return prev;

        // Remove source from its current position
        const next = prev.filter((id) => id !== sourceId);
        // Find the target's new index (after removal)
        const newTargetIdx = next.indexOf(targetId);
        const insertAt = position === "before" ? newTargetIdx : newTargetIdx + 1;
        next.splice(insertAt, 0, sourceId);

        if (workspacePath) persistTabOrder(workspacePath, next);
        return next;
      });
    },
    [workspacePath],
  );

  const closeAllTabs = useCallback(() => {
    // Close all flowchart tabs
    setFlowChartTabs((prev) => {
      if (workspacePath) persistFlowChartTabs(workspacePath, []);
      return [];
    });
    // Close all sheet tabs
    for (const sheetTab of sheetTabs) {
      onCloseSheetTab(sheetTab.id);
    }
    // Clear tab order
    setTabOrder((prev) => {
      if (workspacePath) persistTabOrder(workspacePath, []);
      return [];
    });
    setActiveFlowChartTabId(null);
  }, [sheetTabs, onCloseSheetTab, workspacePath]);

  const closeTabsToRight = useCallback(
    (tabId: string) => {
      setTabOrder((prev) => {
        const idx = prev.indexOf(tabId);
        if (idx < 0) return prev;
        const toClose = prev.slice(idx + 1);
        const keep = prev.slice(0, idx + 1);

        for (const closeId of toClose) {
          const sheetTab = sheetTabs.find((t) => t.id === closeId);
          if (sheetTab) {
            onCloseSheetTab(closeId);
          } else {
            setFlowChartTabs((flowPrev) => flowPrev.filter((t) => t.id !== closeId));
          }
          if (activeFlowChartTabId === closeId) {
            setActiveFlowChartTabId(null);
          }
        }

        if (workspacePath) persistTabOrder(workspacePath, keep);
        return keep;
      });
    },
    [sheetTabs, activeFlowChartTabId, onCloseSheetTab, workspacePath],
  );

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      setTabOrder((prev) => {
        if (!prev.includes(tabId)) return prev;
        const toClose = prev.filter((id) => id !== tabId);
        const keep = [tabId];

        for (const closeId of toClose) {
          const sheetTab = sheetTabs.find((t) => t.id === closeId);
          if (sheetTab) {
            onCloseSheetTab(closeId);
          } else {
            setFlowChartTabs((flowPrev) => flowPrev.filter((t) => t.id !== closeId));
          }
          if (activeFlowChartTabId === closeId) {
            setActiveFlowChartTabId(null);
          }
        }

        if (workspacePath) persistTabOrder(workspacePath, keep);
        return keep;
      });
    },
    [sheetTabs, activeFlowChartTabId, onCloseSheetTab, workspacePath],
  );

  return {
    tabs,
    activeTabId,
    openFlowChartTab,
    closeTab,
    activateTab,
    reorderTabs,
    closeAllTabs,
    closeTabsToRight,
    closeOtherTabs,
  };
}
