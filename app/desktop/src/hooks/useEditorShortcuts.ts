import { useEffect } from "react";

import type { ShortcutBinding } from "../types/desktopApp";

function isShortcutModifierPressed(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function isVirtualCellEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.classList.contains("virtual-cell-input") &&
    Boolean(target.closest('[role="gridcell"]'))
  );
}

function isNativeEditingShortcut(event: KeyboardEvent) {
  if (!isShortcutModifierPressed(event) || event.altKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  return key === "a" || key === "c" || key === "x" || key === "v" || key === "z" || key === "y";
}

function shouldPreserveNativeEditing(event: KeyboardEvent) {
  if (!isEditableElement(event.target) || !isNativeEditingShortcut(event)) {
    return false;
  }

  return !isVirtualCellEditableTarget(event.target);
}

function shouldSuppressBrowserSelectAll(event: KeyboardEvent) {
  return (
    isShortcutModifierPressed(event) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a" &&
    !isEditableElement(event.target)
  );
}

function isShortcutTargetAllowed(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return isVirtualCellEditableTarget(target);
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

      if (shouldPreserveNativeEditing(event)) {
        return;
      }

      const matchedShortcut = bindings.find(
        (shortcut) =>
          shortcut.enabled &&
          shouldHandleShortcutTarget(shortcut, event.target) &&
          shortcut.matches(event),
      );

      if (!matchedShortcut) {
        if (shouldSuppressBrowserSelectAll(event)) {
          event.preventDefault();
        }

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