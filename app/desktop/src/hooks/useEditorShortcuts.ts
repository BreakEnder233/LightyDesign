import { useEffect } from "react";

import type { ShortcutBinding } from "../types/desktopApp";

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

function shouldHandleShortcutTarget(shortcut: ShortcutBinding, target: EventTarget | null) {
  if (shortcut.allowInEditableTarget) {
    return true;
  }

  return isShortcutTargetAllowed(target);
}

function isImeKeyboardEvent(event: KeyboardEvent) {
  return event.isComposing || event.key === "Process" || event.keyCode === 229;
}

export function useEditorShortcuts(bindings: ShortcutBinding[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeKeyboardEvent(event)) {
        return;
      }

      const matchedShortcut = bindings.find(
        (shortcut) =>
          shortcut.enabled &&
          shouldHandleShortcutTarget(shortcut, event.target) &&
          shortcut.matches(event),
      );

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
  }, [bindings]);
}

export { isShortcutModifierPressed };