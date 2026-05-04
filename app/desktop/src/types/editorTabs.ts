import type { SheetTab } from "../workbook-editor/types/desktopApp";

/**
 * A flowchart file open in a tab.
 */
export type FlowChartTabInfo = {
  kind: "flowchart";
  /** Unique identifier — uses the flowchart's relative path. */
  id: string;
  /** Relative path inside FlowCharts/Files/. */
  relativePath: string;
  /** Display name (filename without extension, or alias). */
  name: string;
};

/**
 * A sheet from a workbook open in a tab.
 */
export type SheetTabInfo = {
  kind: "sheet";
  id: string;
  workbookName: string;
  sheetName: string;
};

/**
 * Union of all supported editor tab types.
 */
export type EditorTabInfo = SheetTabInfo | FlowChartTabInfo;

/** Sentinel localStorage key prefix for persisting open tab lists. */
const TAB_PERSISTENCE_PREFIX = "lightydesign.editorTabs:";

// ── Helpers ──────────────────────────────────────────────

export function buildFlowChartTabId(relativePath: string): string {
  return `fc:${relativePath}`;
}

export function isFlowChartTabInfo(tab: EditorTabInfo): tab is FlowChartTabInfo {
  return tab.kind === "flowchart";
}

export function isSheetTabInfo(tab: EditorTabInfo): tab is SheetTabInfo {
  return tab.kind === "sheet";
}

export function convertSheetTabToInfo(sheetTab: SheetTab): SheetTabInfo {
  return { kind: "sheet", id: sheetTab.id, workbookName: sheetTab.workbookName, sheetName: sheetTab.sheetName };
}

export function buildTabPersistenceKey(workspacePath: string): string {
  return `${TAB_PERSISTENCE_PREFIX}${workspacePath}`;
}
