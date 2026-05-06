export type HeaderLayoutRow = {
  headerType: string;
};

export type HeaderPropertyBindingSource = "field" | "attribute";

export type HeaderPropertyEditorKind = "text" | "enum" | "json";

export type HeaderPropertySchema = {
  headerType: string;
  bindingSource: HeaderPropertyBindingSource;
  bindingKey: string;
  fieldName: string;
  label: string;
  editorKind: HeaderPropertyEditorKind;
  valueType: string;
  required: boolean;
  placeholder?: string | null;
  options: string[];
};

export type TypeMetadataSlot = {
  slotName: string;
  allowedKinds: Array<"scalar" | "reference" | "container">;
};

export type TypeMetadataContainer = {
  typeName: string;
  displayName: string;
  slots: TypeMetadataSlot[];
};

export type TypeMetadataReferenceTarget = {
  workbookName: string;
  sheetNames: string[];
};

export type TypeMetadataResponse = {
  scalarTypes: string[];
  containerTypes: TypeMetadataContainer[];
  referenceType: {
    prefix: string;
    format: string;
    example: string;
  };
  referenceTargets: TypeMetadataReferenceTarget[];
};

export type TypeDescriptorResponse = {
  rawType: string;
  typeName: string;
  genericArguments: string[];
  valueType: string;
  isList: boolean;
  isDictionary: boolean;
  isReference: boolean;
  referenceTarget?: {
    workbookName: string;
    sheetName: string;
  } | null;
  children: TypeDescriptorResponse[];
};

export type TypeValidationResponse = {
  ok: boolean;
  message?: string;
  normalizedType?: string;
  descriptor?: TypeDescriptorResponse;
};

export type ValidationRulePropertySchema = {
  name: string;
  valueType: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
  example?: unknown;
  deprecated: boolean;
  aliasOf?: string | null;
};

export type ValidationRuleSchema = {
  mainTypeKey: string;
  typeDisplayName: string;
  description: string;
  properties: ValidationRulePropertySchema[];
  nestedSchemas: Array<{
    propertyName: string;
    label: string;
    description: string;
    schema: ValidationRuleSchema;
  }>;
};

export type ValidationSchemaResolveResponse = {
  ok: boolean;
  message?: string;
  descriptor?: TypeDescriptorResponse;
  schema?: ValidationRuleSchema;
};

export type ValidationRuleValidationResponse = {
  ok: boolean;
  message?: string;
};

export function getHeaderPropertyEditorKind(schema: HeaderPropertySchema): HeaderPropertyEditorKind {
  if (schema.editorKind === "json") {
    return "json";
  }

  if (
    schema.editorKind === "enum" ||
    schema.valueType === "enum" ||
    schema.options.length > 0 ||
    (schema.bindingSource === "attribute" && schema.bindingKey === "ExportScope")
  ) {
    return "enum";
  }

  return "text";
}

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
  alias?: string | null;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
};

export type I18nCodegenOptions = {
  outputRelativePath?: string | null;
  sourceLanguage?: string | null;
};

export type WorkspaceNavigationWorkbook = {
  name: string;
  alias?: string | null;
  directoryPath: string;
  codegen: {
    outputRelativePath?: string | null;
    i18n?: I18nCodegenOptions | null;
  };
  sheetCount: number;
  sheets: WorkspaceNavigationSheet[];
};

export type WorkspaceNavigationResponse = {
  rootPath: string;
  configFilePath: string;
  headersFilePath: string;
  codegen: {
    outputRelativePath?: string | null;
    i18n?: I18nCodegenOptions | null;
  };
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
  codegen: {
    outputRelativePath?: string | null;
  };
  previewOnly: boolean;
  sheets: SheetResponse[];
};

export type WorkspaceTreeSheet = {
  workbookName: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  alias?: string | null;
};

export type WorkspaceTreeWorkbook = {
  name: string;
  directoryPath: string;
  outputRelativePath?: string | null;
  sheets: WorkspaceTreeSheet[];
  alias?: string | null;
};

export type WorkbookCodegenExportResponse = {
  workbookName: string;
  outputDirectoryPath: string;
  fileCount: number;
  files: string[];
  workbookCount?: number;
};

export type WorkbookValidationResponse = {
  workbookName: string;
  errorCount: number;
};

export type SheetTab = {
  id: string;
  workbookName: string;
  sheetName: string;
};

export type SheetSelection = {
  rowIndex: number;
  columnIndex: number;
};

export type SheetSelectionRange = {
  anchor: SheetSelection;
  focus: SheetSelection;
};

export type CellEditRecord = {
  rowIndex: number;
  columnIndex: number;
  previousValue: string;
  nextValue: string;
};

export type CellEditInput = {
  rowIndex: number;
  columnIndex: number;
  nextValue: string;
};

export type CellEditBatch = {
  edits: CellEditRecord[];
};

export type SheetStructureHistoryEntry = {
  kind: "structure";
  previousColumns: SheetColumn[];
  previousRows: string[][];
  nextColumns: SheetColumn[];
  nextRows: string[][];
};

export type SheetHistoryEntry =
  | ({
      kind: "cell-batch";
    } & CellEditBatch)
  | SheetStructureHistoryEntry;

export type SheetLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  data?: SheetResponse;
  draftColumns?: SheetColumn[];
  draftRows?: string[][];
  editedCells?: Record<string, string>;
  undoStack?: SheetHistoryEntry[];
  redoStack?: SheetHistoryEntry[];
  dirty?: boolean;
  error?: string;
};

export type WorkbookSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
};

export type NumericColumnKind = "integer" | "decimal";

export type CellValueEditorKind = "number" | "reference" | "list" | "dictionary" | "object";

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
    kind: "activate-workbook" | "open-directory" | "open-external-url" | "install-update";
    workbookName?: string;
    directoryPath?: string;
    url?: string;
  };
  timestamp: string;
};

const defaultExportScope = "All";

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

export function cloneColumns(columns: SheetColumn[]) {
  return columns.map((column) => ({
    ...column,
    attributes: { ...column.attributes },
  }));
}

export function getColumnExportScope(column: SheetColumn) {
  const exportScope = column.attributes.ExportScope;

  if (typeof exportScope === "string" && exportScope.trim().length > 0) {
    return exportScope;
  }

  return defaultExportScope;
}

export function normalizeSheetColumnForSave(column: SheetColumn): SheetColumn {
  return {
    ...column,
    displayName: column.displayName ?? null,
    attributes: {
      ...column.attributes,
      ExportScope: getColumnExportScope(column),
    },
  };
}

function stringifyHeaderPropertyValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function getFieldValue(column: SheetColumn, bindingKey: string) {
  switch (bindingKey) {
    case "fieldName":
      return column.fieldName;
    case "type":
      return column.type;
    case "displayName":
      return column.displayName ?? "";
    default:
      return "";
  }
}

function parseHeaderPropertyInputValue(schema: HeaderPropertySchema, inputValue: string) {
  const trimmedValue = inputValue.trim();

  if (getHeaderPropertyEditorKind(schema) !== "json") {
    return trimmedValue;
  }

  if (!trimmedValue) {
    return undefined;
  }

  const looksLikeJson = /^[\[{"\d\-]|^(true|false|null)$/i.test(trimmedValue);
  if (!looksLikeJson) {
    return inputValue;
  }

  try {
    return JSON.parse(inputValue) as unknown;
  } catch {
    throw new Error(`${schema.label} 不是合法 JSON。`);
  }
}

export function getHeaderPropertyInputValue(column: SheetColumn, schema: HeaderPropertySchema) {
  if (schema.bindingSource === "attribute" && schema.bindingKey === "ExportScope") {
    return getColumnExportScope(column);
  }

  const value = schema.bindingSource === "field"
    ? getFieldValue(column, schema.bindingKey)
    : column.attributes[schema.bindingKey];

  return stringifyHeaderPropertyValue(value);
}

export function applyHeaderPropertyInputValue(column: SheetColumn, schema: HeaderPropertySchema, inputValue: string) {
  const nextColumn: SheetColumn = {
    ...column,
    attributes: { ...column.attributes },
  };

  const parsedValue = parseHeaderPropertyInputValue(schema, inputValue);
  const normalizedText = inputValue.trim();

  if (schema.bindingSource === "field") {
    if (schema.bindingKey === "fieldName") {
      nextColumn.fieldName = normalizedText;
    }

    if (schema.bindingKey === "type") {
      nextColumn.type = normalizedText;
    }

    if (schema.bindingKey === "displayName") {
      nextColumn.displayName = normalizedText ? inputValue : null;
    }

    return nextColumn;
  }

  if (parsedValue === undefined || normalizedText.length === 0) {
    delete nextColumn.attributes[schema.bindingKey];
    return nextColumn;
  }

  nextColumn.attributes[schema.bindingKey] = parsedValue;
  return nextColumn;
}

export function getSelectionBounds(range: SheetSelectionRange) {
  return {
    startRowIndex: Math.min(range.anchor.rowIndex, range.focus.rowIndex),
    endRowIndex: Math.max(range.anchor.rowIndex, range.focus.rowIndex),
    startColumnIndex: Math.min(range.anchor.columnIndex, range.focus.columnIndex),
    endColumnIndex: Math.max(range.anchor.columnIndex, range.focus.columnIndex),
  };
}

export function updateRowsAtCell(rows: string[][], rowIndex: number, columnIndex: number, nextValue: string) {
  const nextRows = [...rows];
  const nextRow = [...(nextRows[rowIndex] ?? [])];
  nextRow[columnIndex] = nextValue;
  nextRows[rowIndex] = nextRow;
  return nextRows;
}

export function getNumericColumnKindFromType(type: string): NumericColumnKind | null {
  const normalizedType = type.trim().toLocaleLowerCase();

  if (normalizedType === "int" || normalizedType === "long") {
    return "integer";
  }

  if (normalizedType === "float" || normalizedType === "double") {
    return "decimal";
  }

  return null;
}

export function getColumnNumericKind(column: Pick<SheetColumn, "type">): NumericColumnKind | null {
  return getNumericColumnKindFromType(column.type);
}

export function getColumnValueEditorKind(
  column: Pick<SheetColumn, "type" | "isReferenceType" | "isListType">,
): CellValueEditorKind | null {
  if (getNumericColumnKindFromType(column.type)) {
    return "number";
  }

  if (column.isReferenceType) {
    return "reference";
  }

  if (/^dictionary\s*</i.test(column.type.trim())) {
    return "dictionary";
  }

  if (column.isListType) {
    return "list";
  }

  if (/^object$/i.test(column.type.trim())) {
    return "object";
  }

  return null;
}

export function getCellValueEditorLabel(kind: CellValueEditorKind): string {
  switch (kind) {
    case "number":
      return "编辑数值...";
    case "reference":
      return "编辑引用...";
    case "list":
      return "编辑列表...";
    case "dictionary":
      return "编辑字典...";
    case "object":
      return "编辑对象...";
    default:
      return "编辑值...";
  }
}

export function getColumnEditorKind(column: SheetColumn): ColumnEditorKind {
  const normalizedType = column.type.trim().toLocaleLowerCase();

  if (normalizedType === "bool" || normalizedType === "boolean") {
    return "boolean";
  }

  if (getColumnNumericKind(column)) {
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


