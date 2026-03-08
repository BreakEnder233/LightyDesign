export type HeaderLayoutRow = {
  headerType: string;
};

export type SheetColumn = {
  fieldName: string;
  type: string;
  displayName?: string | null;
  isListType: boolean;
  isReferenceType: boolean;
  attributes: Record<string, unknown>;
};

export type SheetMetadata = {
  workbookName?: string | null;
  name: string;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
  columns: SheetColumn[];
};

export type WorkspaceNavigationSheet = {
  workbookName: string;
  name: string;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
};

export type WorkspaceNavigationWorkbook = {
  name: string;
  directoryPath: string;
  sheetCount: number;
  sheets: WorkspaceNavigationSheet[];
};

export type WorkspaceNavigationResponse = {
  rootPath: string;
  configFilePath: string;
  headersFilePath: string;
  headerLayout: {
    count: number;
    rows: HeaderLayoutRow[];
  };
  workbooks: WorkspaceNavigationWorkbook[];
};

export type SheetResponse = {
  metadata: SheetMetadata;
  rows: string[][];
};

export type WorkbookResponse = {
  name: string;
  directoryPath: string;
  previewOnly: boolean;
  sheets: SheetResponse[];
};

export type WorkspaceTreeSheet = {
  workbookName: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
};

export type WorkspaceTreeWorkbook = {
  name: string;
  sheets: WorkspaceTreeSheet[];
};

export type SheetTab = {
  id: string;
  workbookName: string;
  sheetName: string;
};

export type CellEditRecord = {
  rowIndex: number;
  columnIndex: number;
  previousValue: string;
  nextValue: string;
};

export type SheetLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  data?: SheetResponse;
  draftRows?: string[][];
  editedCells?: Record<string, string>;
  undoStack?: CellEditRecord[];
  redoStack?: CellEditRecord[];
  dirty?: boolean;
  error?: string;
};

export type WorkbookSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
};

export type ColumnEditorKind = "text" | "number" | "boolean" | "reference" | "list";

export type ShortcutBinding = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  allowInEditableTarget?: boolean;
  matches: (event: KeyboardEvent) => boolean;
  run: () => void;
};

export type ToastNotification = {
  id: number;
  title: string;
  summary: string;
  detail?: string;
  source: "workspace" | "sheet" | "save" | "system";
  variant: "error" | "success";
  canOpenDetail: boolean;
  durationMs?: number;
  action?: {
    label: string;
    kind: "activate-workbook";
    workbookName: string;
  };
  timestamp: string;
};

export function buildSheetTabId(workbookName: string, sheetName: string) {
  return `${workbookName}::${sheetName}`;
}

export function buildWorkspaceScopedStorageKey(workspacePath: string, key: string) {
  return `lightydesign.workspacePath:${workspacePath}:${key}`;
}

export function isSheetTab(value: unknown): value is SheetTab {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SheetTab>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.workbookName === "string" &&
    typeof candidate.sheetName === "string"
  );
}

export function isSheetAvailable(workspace: WorkspaceNavigationResponse, tab: SheetTab) {
  return workspace.workbooks.some(
    (workbook) =>
      workbook.name === tab.workbookName &&
      workbook.sheets.some((sheet) => sheet.name === tab.sheetName),
  );
}

export function buildCellKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`;
}

export function cloneRows(rows: string[][]) {
  return rows.map((row) => [...row]);
}

export function updateRowsAtCell(rows: string[][], rowIndex: number, columnIndex: number, nextValue: string) {
  const nextRows = [...rows];
  const nextRow = [...(nextRows[rowIndex] ?? [])];
  nextRow[columnIndex] = nextValue;
  nextRows[rowIndex] = nextRow;
  return nextRows;
}

export function getColumnEditorKind(column: SheetColumn): ColumnEditorKind {
  const normalizedType = column.type.trim().toLocaleLowerCase();

  if (normalizedType === "bool" || normalizedType === "boolean") {
    return "boolean";
  }

  if (["int", "long", "float", "double", "decimal", "short", "byte"].includes(normalizedType)) {
    return "number";
  }

  if (column.isReferenceType) {
    return "reference";
  }

  if (column.isListType) {
    return "list";
  }

  return "text";
}