import { useCallback, useState } from "react";
import type { EditorTabInfo, TabContextMenuState } from "../types/editorTabs";
import { isFlowChartTabInfo } from "../types/editorTabs";
import { TabContextMenu } from "./TabContextMenu";

function getTabDisplayName(tab: EditorTabInfo): string {
  if (isFlowChartTabInfo(tab)) {
    return tab.name;
  }
  return tab.sheetName;
}

type EditorTabBarProps = {
  tabs: EditorTabInfo[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderTabs: (sourceId: string, targetId: string, position: "before" | "after") => void;
  onCloseAllTabs: () => void;
  onCloseTabsToRight: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
};

function handleTabKeyDown(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function EditorTabBar({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onReorderTabs,
  onCloseAllTabs,
  onCloseTabsToRight,
  onCloseOtherTabs,
}: EditorTabBarProps) {
  const [contextMenuState, setContextMenuState] = useState<TabContextMenuState | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  const handleClose = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, tabId: string) => {
      event.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  // ── Drag & Drop handlers ──

  const handleDragStart = useCallback(
    (event: React.DragEvent, tabId: string) => {
      setDragSourceId(tabId);
      event.dataTransfer.effectAllowed = "move";
      // Required for Firefox
      event.dataTransfer.setData("text/plain", tabId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, tabId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverTargetId(tabId);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (_event: React.DragEvent, tabId: string) => {
      setDragOverTargetId((prev) => (prev === tabId ? null : prev));
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent, targetId: string) => {
      event.preventDefault();
      if (!dragSourceId || dragSourceId === targetId) return;

      // Determine drop position: before or after based on mouse X within the tab
      const targetElement = event.currentTarget as HTMLElement;
      const rect = targetElement.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const position = relativeX < rect.width / 2 ? "before" : "after";

      onReorderTabs(dragSourceId, targetId, position);
      setDragSourceId(null);
      setDragOverTargetId(null);
    },
    [onReorderTabs, dragSourceId],
  );

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDragOverTargetId(null);
  }, []);

  // ── Context Menu handlers ──

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, tabId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        targetTabId: tabId,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <>
      <div className="editor-tab-bar" role="tablist" aria-label="打开的编辑器">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`editor-tab${tab.id === activeTabId ? " is-active" : ""}${tab.id === dragSourceId ? " is-drag-source" : ""}${tab.id === dragOverTargetId ? " is-drag-over" : ""}`}
            onClick={() => onActivateTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, () => onActivateTab(tab.id))}
            onContextMenu={(event) => handleContextMenu(event, tab.id)}
            draggable
            onDragStart={(event) => handleDragStart(event, tab.id)}
            onDragOver={(event) => handleDragOver(event, tab.id)}
            onDragLeave={(event) => handleDragLeave(event, tab.id)}
            onDrop={(event) => handleDrop(event, tab.id)}
            onDragEnd={handleDragEnd}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={0}
          >
            <span className="editor-tab-icon" aria-hidden="true">
              {isFlowChartTabInfo(tab) ? "◆" : "📋"}
            </span>
            <span className="editor-tab-label">{getTabDisplayName(tab)}</span>
            <span className="editor-tab-kind-badge">
              {isFlowChartTabInfo(tab) ? "流程图" : "表格"}
            </span>
            <button
              className="editor-tab-close"
              onClick={(event) => handleClose(event, tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  handleClose(event, tab.id);
                }
              }}
              aria-label={`关闭 ${getTabDisplayName(tab)}`}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {contextMenuState ? (
        <TabContextMenu
          menuState={contextMenuState}
          onClose={closeContextMenu}
          onCloseTab={onCloseTab}
          onCloseAllTabs={onCloseAllTabs}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
        />
      ) : null}
    </>
  );
}
