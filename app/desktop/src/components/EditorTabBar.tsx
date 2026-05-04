import { useCallback, useRef } from "react";
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

export function EditorTabBar({ tabs, activeTabId, onActivateTab, onCloseTab }: EditorTabBarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(
    (event: React.MouseEvent, tabId: string) => {
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
        <button
          key={tab.id}
          className={`editor-tab${tab.id === activeTabId ? " is-active" : ""}`}
          onClick={() => onActivateTab(tab.id)}
          role="tab"
          aria-selected={tab.id === activeTabId}
          type="button"
        >
          <span className="editor-tab-icon" aria-hidden="true">
            {isFlowChartTabInfo(tab) ? "◆" : "📋"}
          </span>
          <span className="editor-tab-label">{getTabDisplayName(tab)}</span>
          <span className="editor-tab-kind-badge">
            {isFlowChartTabInfo(tab) ? "流程图" : "表格"}
          </span>
          <button
            ref={closeButtonRef}
            className="editor-tab-close"
            onClick={(event) => handleClose(event, tab.id)}
            aria-label={`关闭 ${getTabDisplayName(tab)}`}
            type="button"
          >
            ×
          </button>
        </button>
      ))}
    </div>
  );
}
