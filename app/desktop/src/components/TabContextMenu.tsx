import { useEffect, useRef } from "react";
import type { TabContextMenuState } from "../types/editorTabs";

type TabContextMenuProps = {
  menuState: TabContextMenuState;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onCloseAllTabs: () => void;
  onCloseTabsToRight: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
};

export function TabContextMenu({
  menuState,
  onClose,
  onCloseTab,
  onCloseAllTabs,
  onCloseTabsToRight,
  onCloseOtherTabs,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // Delay adding listener to avoid the right-click event itself closing the menu
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Focus the first item when opened
  useEffect(() => {
    const firstButton = menuRef.current?.querySelector<HTMLButtonElement>(".tab-context-menu-item");
    firstButton?.focus();
  }, []);

  const handleItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="tab-context-menu"
      ref={menuRef}
      style={{ left: menuState.x, top: menuState.y }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
    >
      <button
        className="tab-context-menu-item"
        onClick={() => handleItemClick(() => onCloseTab(menuState.targetTabId))}
        type="button"
        role="menuitem"
      >
        关闭
      </button>
      <button
        className="tab-context-menu-item"
        onClick={() => handleItemClick(() => onCloseTabsToRight(menuState.targetTabId))}
        type="button"
        role="menuitem"
      >
        关闭右侧
      </button>
      <button
        className="tab-context-menu-item"
        onClick={() => handleItemClick(() => onCloseOtherTabs(menuState.targetTabId))}
        type="button"
        role="menuitem"
      >
        关闭其他
      </button>
      <div className="tab-context-menu-separator" role="separator" />
      <button
        className="tab-context-menu-item"
        onClick={() => handleItemClick(onCloseAllTabs)}
        type="button"
        role="menuitem"
      >
        关闭全部
      </button>
    </div>
  );
}
