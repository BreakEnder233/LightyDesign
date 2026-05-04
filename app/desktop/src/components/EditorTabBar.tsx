import { useCallback } from "react";
import type { EditorTabInfo } from "../types/editorTabs";
import { isFlowChartTabInfo } from "../types/editorTabs";

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
};

function handleTabKeyDown(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function EditorTabBar({ tabs, activeTabId, onActivateTab, onCloseTab }: EditorTabBarProps) {
  const handleClose = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, tabId: string) => {
      event.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="editor-tab-bar" role="tablist" aria-label="打开的编辑器">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab${tab.id === activeTabId ? " is-active" : ""}`}
          onClick={() => onActivateTab(tab.id)}
          onKeyDown={(event) => handleTabKeyDown(event, () => onActivateTab(tab.id))}
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
  );
}
