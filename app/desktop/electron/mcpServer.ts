import http from "node:http";
import fs from "node:fs/promises";

type JsonRpcId = number | string | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type AppPreferences = {
  mcp?: {
    enabled?: boolean;
  };
};

type HeaderPropertySchema = {
  headerType: string;
  bindingSource: string;
  bindingKey: string;
  fieldName: string;
  label: string;
  editorKind: string;
  valueType: string;
  required: boolean;
  placeholder?: string | null;
  options: string[];
};

type SheetColumn = {
  fieldName: string;
  type: string;
  displayName?: string | null;
  isListType?: boolean;
  isReferenceType?: boolean;
  attributes: Record<string, unknown>;
};

type SheetMetadata = {
  workbookName?: string | null;
  name: string;
  dataFilePath: string;
  headerFilePath: string;
  rowCount: number;
  columnCount: number;
  columns: SheetColumn[];
};

type SheetResponse = {
  metadata: SheetMetadata;
  rows: string[][];
};

type WorkbookResponse = {
  name: string;
  directoryPath: string;
  codegen: {
    outputRelativePath?: string | null;
  };
  previewOnly: boolean;
  sheets: SheetResponse[];
};

type WorkbookSavePayload = {
  name: string;
  sheets: Array<{
    name: string;
    columns: Array<{
      fieldName: string;
      type: string;
      displayName?: string | null;
      attributes: Record<string, unknown>;
    }>;
    rows: string[][];
  }>;
};

type RowPatchOperation = {
  kind: "insert" | "update" | "delete";
  rowIndex?: number;
  cells?: unknown;
  fieldValues?: unknown;
};

type ColumnPatchOperation = {
  kind: "insert" | "update" | "delete" | "move";
  index?: number;
  fieldName?: string;
  targetFieldName?: string;
  toIndex?: number;
  defaultValue?: unknown;
  attributes?: unknown;
  displayName?: unknown;
  type?: unknown;
  column?: unknown;
};

type FlowChartDocument = Record<string, unknown>;

type FlowChartNodeDefinitionResponse = {
  kind: "flowchart-node";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
  nodeKind?: string | null;
  document: FlowChartDocument | null;
};

type FlowChartFileResponse = {
  kind: "flowchart-file";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
  document: FlowChartDocument | null;
};

type FlowChartCatalogResponse = {
  flowChartsRootPath: string;
  flowChartNodesRootPath: string;
  flowChartFilesRootPath: string;
  nodeDirectories: string[];
  fileDirectories: string[];
  nodeDefinitions: Array<Omit<FlowChartNodeDefinitionResponse, "document">>;
  files: Array<Omit<FlowChartFileResponse, "document">>;
};

const desktopHostUrl = process.env.LDD_DESKTOP_HOST_URL ?? "http://127.0.0.1:5000";
const editorContextFilePath = process.env.LDD_EDITOR_CONTEXT_FILE ?? "";
const preferencesFilePath = process.env.LDD_MCP_PREFERENCES_FILE ?? "";
const transportMode = (process.env.LDD_MCP_TRANSPORT ?? "stdio").trim().toLowerCase();
const httpHost = process.env.LDD_MCP_HTTP_HOST ?? "127.0.0.1";
const parsedHttpPort = Number.parseInt(process.env.LDD_MCP_HTTP_PORT ?? "39231", 10);
const httpPort = Number.isFinite(parsedHttpPort) ? parsedHttpPort : 39231;
const httpPath = (() => {
  const rawPath = (process.env.LDD_MCP_HTTP_PATH ?? "/mcp").trim();
  return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
})();
const serverInfo = {
  name: "LightyDesign.McpServer",
  version: "0.2.0",
};
const selectionRowPreviewLimit = 50;
const defaultSheetRowPageSize = 50;
const maxSheetRowPageSize = 200;

const jsonScalarSchema = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "integer" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

const rowPatchOperationSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["insert", "update", "delete"],
    },
    rowIndex: { type: "integer", minimum: 0 },
    cells: {
      type: "array",
      items: jsonScalarSchema,
    },
    fieldValues: {
      type: "object",
      additionalProperties: jsonScalarSchema,
    },
  },
  required: ["kind"],
  additionalProperties: false,
} as const;

const columnPatchOperationSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["insert", "update", "delete", "move"],
    },
    index: { type: "integer", minimum: 0 },
    fieldName: { type: "string" },
    targetFieldName: { type: "string" },
    toIndex: { type: "integer", minimum: 0 },
    defaultValue: jsonScalarSchema,
    attributes: {
      type: "object",
      additionalProperties: jsonScalarSchema,
    },
    displayName: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    type: { type: "string" },
    column: {
      type: "object",
      additionalProperties: true,
    },
  },
  required: ["kind"],
  additionalProperties: false,
} as const;

const flowChartDocumentSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const tools: ToolDefinition[] = [
  {
    name: "get_workspace_navigation",
    description: "读取当前工作区或指定工作区的工作簿与表导航。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string", description: "可选。未提供时优先使用当前编辑器上下文中的工作区路径。" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_flowchart_navigation",
    description: "读取当前工作区或指定工作区的流程图导航、目录与资源摘要。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string", description: "可选。未提供时优先使用当前编辑器上下文中的工作区路径。" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_header_property_schemas",
    description: "读取当前工作区表头属性模式，供 AI 生成或修改列配置时参考。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_sheet_schema",
    description: "读取指定表或当前活动表的列定义与元数据。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        sheetName: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_sheet_rows",
    description: "分页读取指定表或当前活动表的行数据。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        sheetName: { type: "string" },
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: maxSheetRowPageSize },
      },
      additionalProperties: false,
    },
  },
  {
    name: "validate_column_type",
    description: "校验列类型字符串，并返回标准化结果与引用目标信息。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        type: { type: "string" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "get_current_sheet",
    description: "读取桌面端当前活动 Sheet 的上下文摘要。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_current_selection",
    description: "读取桌面端当前选区的地址、列定义与选中单元格预览。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_current_flowchart",
    description: "读取桌面端当前活动流程图的上下文摘要。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_current_flowchart_selection",
    description: "读取桌面端当前流程图选区、焦点与节点/连线摘要。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_flowchart_node_definition",
    description: "读取指定流程图节点定义的完整文档。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        relativePath: { type: "string" },
      },
      required: ["relativePath"],
      additionalProperties: false,
    },
  },
  {
    name: "get_flowchart_file",
    description: "读取指定流程图文件或当前活动流程图的完整文档。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        relativePath: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_active_editor_context",
    description: "读取桌面端当前编辑器上下文，包括工作区、活动 Sheet 与当前选区。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "create_workbook",
    description: "在当前工作区或指定工作区中创建新的工作簿。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
      },
      required: ["workbookName"],
      additionalProperties: false,
    },
  },
  {
    name: "create_sheet",
    description: "在指定工作簿中创建新的 Sheet。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        sheetName: { type: "string" },
      },
      required: ["workbookName", "sheetName"],
      additionalProperties: false,
    },
  },
  {
    name: "save_flowchart_file",
    description: "创建或保存指定流程图文件，写入完整流程图文档。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        relativePath: { type: "string" },
        document: flowChartDocumentSchema,
      },
      required: ["document"],
      additionalProperties: false,
    },
  },
  {
    name: "export_flowchart_codegen",
    description: "触发流程图代码导出，支持当前流程图、批量流程图或全工作区流程图。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        mode: {
          type: "string",
          enum: ["single", "batch", "all"],
        },
        relativePath: { type: "string" },
        relativePaths: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "patch_sheet_rows",
    description: "用结构化补丁批量插入、更新或删除指定 Sheet 的行。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        sheetName: { type: "string" },
        dryRun: { type: "boolean" },
        operations: {
          type: "array",
          minItems: 1,
          items: rowPatchOperationSchema,
        },
      },
      required: ["operations"],
      additionalProperties: false,
    },
  },
  {
    name: "patch_sheet_columns",
    description: "用结构化补丁新增、更新、删除或重排序指定 Sheet 的列定义。",
    inputSchema: {
      type: "object",
      properties: {
        workspacePath: { type: "string" },
        workbookName: { type: "string" },
        sheetName: { type: "string" },
        dryRun: { type: "boolean" },
        operations: {
          type: "array",
          minItems: 1,
          items: columnPatchOperationSchema,
        },
      },
      required: ["operations"],
      additionalProperties: false,
    },
  },
];

let inputBuffer = Buffer.alloc(0);

function sendMessage(message: unknown) {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  process.stdout.write(header + payload);
}

function createResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function createError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

function sendResult(id: JsonRpcId, result: unknown) {
  sendMessage(createResult(id, result));
}

function sendError(id: JsonRpcId, code: number, message: string) {
  sendMessage(createError(id, code, message));
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!filePath) {
    return null;
  }

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function ensureServiceEnabled() {
  const preferences = await readJsonFile<AppPreferences>(preferencesFilePath);
  if (preferences?.mcp?.enabled === true) {
    return;
  }

  throw new Error("MCP 服务当前处于关闭状态。请在 LightyDesign 顶部工具栏的 AI工具 菜单中启用。\n\n如果只是首次接入，请先在桌面端点击“AI工具 -> 开启 MCP 服务”，再复制配置 JSON 到你的 AI 客户端。\n");
}

async function readEditorContext() {
  return readJsonFile<Record<string, unknown>>(editorContextFilePath);
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildToolResult(result: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

async function fetchJson<T>(requestUrl: string, init?: RequestInit): Promise<T> {
  const response = await fetch(requestUrl, init);
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(getString(payload?.error) ?? `请求失败: ${response.status}`);
  }

  return payload as T;
}

async function postJson<T>(requestUrl: string, body: unknown): Promise<T> {
  return fetchJson<T>(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function resolveWorkspacePath(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const workspacePath = getString(args.workspacePath) ?? getString(context?.workspacePath);
  if (!workspacePath) {
    throw new Error("未提供 workspacePath，且当前桌面端没有活动工作区上下文。请先在 LightyDesign 中打开工作区，或显式传入 workspacePath。");
  }

  return workspacePath;
}

function resolveSheetTarget(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const contextSheet = asRecord(context?.currentSheet);
  const workspacePath = resolveWorkspacePath(args, context);
  const workbookName = getString(args.workbookName) ?? getString(contextSheet.workbookName);
  const sheetName = getString(args.sheetName) ?? getString(contextSheet.sheetName);

  if (!workbookName || !sheetName) {
    throw new Error("未提供 workbookName 或 sheetName，且当前桌面端没有活动 Sheet 上下文。请先在 LightyDesign 中激活目标表，或显式传入 workbookName / sheetName。");
  }

  return {
    workspacePath,
    workbookName,
    sheetName,
  };
}

function normalizeFlowChartRelativePath(relativePath: string | null) {
  if (!relativePath) {
    return "";
  }

  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.json$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
}

function encodeFlowChartRelativePath(relativePath: string) {
  return relativePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveFlowChartTarget(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const workspacePath = resolveWorkspacePath(args, context);
  const contextFlowChart = asRecord(context?.currentFlowChart);
  const relativePath = normalizeFlowChartRelativePath(getString(args.relativePath) ?? getString(contextFlowChart.relativePath));

  if (!relativePath) {
    throw new Error("未提供 relativePath，且当前桌面端没有活动流程图上下文。请先在 LightyDesign 中激活目标流程图，或显式传入 relativePath。");
  }

  return {
    workspacePath,
    relativePath,
  };
}

function normalizeRelativePathList(value: unknown) {
  return [...new Set(
    asArray(value)
      .map((entry) => normalizeFlowChartRelativePath(getString(entry)))
      .filter((entry) => entry.length > 0),
  )];
}

function requireJsonObject(value: unknown, errorMessage: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}

function normalizeColumn(column: SheetColumn): SheetColumn {
  return {
    fieldName: column.fieldName,
    type: column.type,
    displayName: column.displayName ?? null,
    isListType: Boolean(column.isListType),
    isReferenceType: Boolean(column.isReferenceType),
    attributes: { ...(column.attributes ?? {}) },
  };
}

function cloneSheet(sheet: SheetResponse): SheetResponse {
  return {
    metadata: {
      ...sheet.metadata,
      columns: sheet.metadata.columns.map((column) => normalizeColumn(column)),
    },
    rows: sheet.rows.map((row) => [...row]),
  };
}

function buildWorkbookSavePayload(workbook: WorkbookResponse): WorkbookSavePayload {
  return {
    name: workbook.name,
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.metadata.name,
      columns: sheet.metadata.columns.map((column) => ({
        fieldName: column.fieldName,
        type: column.type,
        displayName: column.displayName ?? null,
        attributes: { ...(column.attributes ?? {}) },
      })),
      rows: sheet.rows.map((row) => [...row]),
    })),
  };
}

function findSheetIndex(workbook: WorkbookResponse, sheetName: string) {
  return workbook.sheets.findIndex((sheet) => sheet.metadata.name === sheetName);
}

function getColumnIndex(columns: SheetColumn[], fieldName: string) {
  return columns.findIndex((column) => column.fieldName === fieldName);
}

function ensureColumnIndex(columns: SheetColumn[], fieldName: string) {
  const columnIndex = getColumnIndex(columns, fieldName);
  if (columnIndex < 0) {
    throw new Error(`列 '${fieldName}' 不存在。`);
  }

  return columnIndex;
}

function buildEmptyRow(columnCount: number) {
  return Array.from({ length: columnCount }, () => "");
}

function ensureRowExists(rows: string[][], rowIndex: number, columnCount: number) {
  const currentRow = rows[rowIndex];
  if (!currentRow) {
    throw new Error(`行索引 ${rowIndex} 超出范围。`);
  }

  return Array.from({ length: columnCount }, (_, columnIndex) => currentRow[columnIndex] ?? "");
}

function normalizeStringMatrixRow(value: unknown, columnCount: number) {
  const cells = asArray(value).map((cell) => (cell == null ? "" : String(cell)));
  return Array.from({ length: columnCount }, (_, columnIndex) => cells[columnIndex] ?? "");
}

function normalizeFieldValues(value: unknown) {
  const record = asRecord(value);
  const normalized: Record<string, string> = {};

  Object.entries(record).forEach(([key, cellValue]) => {
    normalized[key] = cellValue == null ? "" : String(cellValue);
  });

  return normalized;
}

function applyFieldValuesToRow(row: string[], columns: SheetColumn[], fieldValues: Record<string, string>) {
  const nextRow = [...row];
  Object.entries(fieldValues).forEach(([fieldName, value]) => {
    const columnIndex = ensureColumnIndex(columns, fieldName);
    nextRow[columnIndex] = value;
  });

  return nextRow;
}

function buildInsertRow(operation: RowPatchOperation, columns: SheetColumn[]) {
  const fieldValues = normalizeFieldValues(operation.fieldValues);
  if (operation.cells !== undefined && Object.keys(fieldValues).length > 0) {
    throw new Error("insert 操作不能同时提供 cells 和 fieldValues。");
  }

  if (operation.cells !== undefined) {
    return normalizeStringMatrixRow(operation.cells, columns.length);
  }

  return applyFieldValuesToRow(buildEmptyRow(columns.length), columns, fieldValues);
}

function createColumnFromOperation(operation: ColumnPatchOperation): SheetColumn {
  const columnPayload = asRecord(operation.column);
  const fieldName = getString(columnPayload.fieldName) ?? getString(operation.fieldName);
  const type = getString(columnPayload.type) ?? getString(operation.type);
  const displayName = getString(columnPayload.displayName) ?? getString(operation.displayName);
  const attributes = {
    ...asRecord(columnPayload.attributes),
    ...asRecord(operation.attributes),
  };

  if (!fieldName) {
    throw new Error("insert 列操作缺少 fieldName。");
  }

  if (!type) {
    throw new Error(`列 '${fieldName}' 缺少 type。`);
  }

  return {
    fieldName,
    type,
    displayName,
    isListType: false,
    isReferenceType: false,
    attributes,
  };
}

function summarizeSheetSchema(sheet: SheetResponse) {
  const columns = sheet.metadata.columns.map((column) => normalizeColumn(column));
  const idColumns = columns.filter((column) => /^ID\d*$/i.test(column.fieldName)).map((column) => column.fieldName);
  const referenceColumns = columns.filter((column) => column.isReferenceType).map((column) => ({
    fieldName: column.fieldName,
    type: column.type,
  }));

  return {
    workbookName: sheet.metadata.workbookName ?? null,
    sheetName: sheet.metadata.name,
    rowCount: sheet.metadata.rowCount,
    columnCount: sheet.metadata.columnCount,
    idColumns,
    referenceColumns,
    columns,
  };
}

function buildRowPreview(sheet: SheetResponse, affectedRowIndices: number[]) {
  const uniqueIndices = [...new Set(affectedRowIndices)].filter((rowIndex) => rowIndex >= 0 && rowIndex < sheet.rows.length);
  return uniqueIndices.slice(0, selectionRowPreviewLimit).map((rowIndex) => ({
    rowIndex,
    cells: sheet.rows[rowIndex] ?? [],
  }));
}

async function loadWorkbook(workspacePath: string, workbookName: string) {
  const query = new URLSearchParams({ workspacePath });
  return fetchJson<WorkbookResponse>(
    `${desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(workbookName)}?${query.toString()}`,
  );
}

async function saveWorkbook(workspacePath: string, workbook: WorkbookResponse) {
  return postJson<WorkbookResponse>(`${desktopHostUrl}/api/workspace/workbooks/save`, {
    workspacePath,
    workbook: buildWorkbookSavePayload(workbook),
  });
}

async function exportFlowChartCodegen(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const workspacePath = resolveWorkspacePath(args, context);
  const rawMode = getString(args.mode);
  if (rawMode && rawMode !== "single" && rawMode !== "batch" && rawMode !== "all") {
    throw new Error("export_flowchart_codegen 的 mode 仅支持 single、batch 或 all。");
  }

  if (rawMode === "all") {
    return postJson(`${desktopHostUrl}/api/workspace/flowcharts/codegen/export-all`, {
      workspacePath,
    });
  }

  const relativePaths = normalizeRelativePathList(args.relativePaths);
  if (rawMode === "batch" || relativePaths.length > 1) {
    if (relativePaths.length === 0) {
      throw new Error("export_flowchart_codegen 在 batch 模式下需要提供 relativePaths。");
    }

    return postJson(`${desktopHostUrl}/api/workspace/flowcharts/codegen/export-batch`, {
      workspacePath,
      relativePaths,
    });
  }

  const relativePath = relativePaths[0] ?? resolveFlowChartTarget(args, context).relativePath;
  return postJson(`${desktopHostUrl}/api/workspace/flowcharts/codegen/export`, {
    workspacePath,
    relativePath,
  });
}

async function patchSheetRows(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const target = resolveSheetTarget(args, context);
  const dryRun = getBoolean(args.dryRun, false);
  const operations = asArray(args.operations) as RowPatchOperation[];
  if (operations.length === 0) {
    throw new Error("patch_sheet_rows 至少需要一个操作。");
  }

  return postJson(
    `${desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(target.workbookName)}/sheets/${encodeURIComponent(target.sheetName)}/rows/patch`,
    {
      workspacePath: target.workspacePath,
      workbookName: target.workbookName,
      sheetName: target.sheetName,
      dryRun,
      operations,
    },
  );
}

async function patchSheetColumns(args: Record<string, unknown>, context: Record<string, unknown> | null) {
  const target = resolveSheetTarget(args, context);
  const dryRun = getBoolean(args.dryRun, false);
  const operations = asArray(args.operations) as ColumnPatchOperation[];
  if (operations.length === 0) {
    throw new Error("patch_sheet_columns 至少需要一个操作。");
  }

  return postJson(
    `${desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(target.workbookName)}/sheets/${encodeURIComponent(target.sheetName)}/columns/patch`,
    {
      workspacePath: target.workspacePath,
      workbookName: target.workbookName,
      sheetName: target.sheetName,
      dryRun,
      operations,
    },
  );
}

async function handleToolCall(name: string, rawArguments: unknown) {
  await ensureServiceEnabled();

  const args = asRecord(rawArguments);
  const context = await readEditorContext();

  switch (name) {
    case "get_workspace_navigation": {
      const workspacePath = resolveWorkspacePath(args, context);
      const query = new URLSearchParams({ workspacePath });
      return fetchJson(`${desktopHostUrl}/api/workspace/navigation?${query.toString()}`);
    }
    case "get_flowchart_navigation": {
      const workspacePath = resolveWorkspacePath(args, context);
      const query = new URLSearchParams({ workspacePath });
      return fetchJson<FlowChartCatalogResponse>(`${desktopHostUrl}/api/workspace/flowcharts/navigation?${query.toString()}`);
    }
    case "get_header_property_schemas": {
      const workspacePath = resolveWorkspacePath(args, context);
      const query = new URLSearchParams({ workspacePath });
      const response = await fetchJson<{ properties: HeaderPropertySchema[] }>(
        `${desktopHostUrl}/api/workspace/header-properties?${query.toString()}`,
      );
      return response.properties;
    }
    case "get_sheet_schema": {
      const target = resolveSheetTarget(args, context);
      const query = new URLSearchParams({ workspacePath: target.workspacePath });
      const sheet = await fetchJson<SheetMetadata>(
        `${desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(target.workbookName)}/sheets/${encodeURIComponent(target.sheetName)}/metadata?${query.toString()}`,
      );
      return summarizeSheetSchema({ metadata: sheet, rows: [] });
    }
    case "get_sheet_rows": {
      const target = resolveSheetTarget(args, context);
      const offset = Math.max(0, Math.trunc(getNumber(args.offset, 0)));
      const limit = Math.max(1, Math.min(maxSheetRowPageSize, Math.trunc(getNumber(args.limit, defaultSheetRowPageSize))));
      const query = new URLSearchParams({ workspacePath: target.workspacePath });
      const sheet = await fetchJson<SheetResponse>(
        `${desktopHostUrl}/api/workspace/workbooks/${encodeURIComponent(target.workbookName)}/sheets/${encodeURIComponent(target.sheetName)}?${query.toString()}`,
      );
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      return {
        workbookName: target.workbookName,
        sheetName: target.sheetName,
        offset,
        limit,
        totalRowCount: rows.length,
        hasMore: offset + limit < rows.length,
        rows: rows.slice(offset, offset + limit),
      };
    }
    case "validate_column_type": {
      const workspacePath = resolveWorkspacePath(args, context);
      const workbookName = getString(args.workbookName) ?? getString(asRecord(context?.currentSheet).workbookName) ?? "";
      const type = getString(args.type);
      if (!type) {
        throw new Error("validate_column_type 缺少 type 参数。");
      }

      const query = new URLSearchParams({
        type,
        workspacePath,
        workbookName,
      });
      return fetchJson(`${desktopHostUrl}/api/workspace/type-validation?${query.toString()}`);
    }
    case "get_current_sheet": {
      const currentSheet = context?.currentSheet;
      if (!currentSheet) {
        throw new Error("当前桌面端没有活动 Sheet。请先在 LightyDesign 中打开并激活一张表。");
      }

      return currentSheet;
    }
    case "get_current_selection": {
      const selection = context?.selection;
      if (!selection) {
        throw new Error("当前桌面端没有活动选区。请先在 LightyDesign 中选择一个单元格或区域。");
      }

      return selection;
    }
    case "get_current_flowchart": {
      const currentFlowChart = context?.currentFlowChart;
      if (!currentFlowChart) {
        throw new Error("当前桌面端没有活动流程图。请先在 LightyDesign 中切换到流程图编辑器并打开目标流程图。");
      }

      return currentFlowChart;
    }
    case "get_current_flowchart_selection": {
      const selection = context?.flowChartSelection;
      if (!selection) {
        throw new Error("当前桌面端没有活动流程图选区。请先在 LightyDesign 中切换到流程图编辑器并选中节点或连线。");
      }

      return selection;
    }
    case "get_flowchart_node_definition": {
      const workspacePath = resolveWorkspacePath(args, context);
      const relativePath = normalizeFlowChartRelativePath(getString(args.relativePath));
      if (!relativePath) {
        throw new Error("get_flowchart_node_definition 缺少 relativePath 参数。");
      }

      const query = new URLSearchParams({ workspacePath });
      return fetchJson<FlowChartNodeDefinitionResponse>(
        `${desktopHostUrl}/api/workspace/flowcharts/nodes/${encodeFlowChartRelativePath(relativePath)}?${query.toString()}`,
      );
    }
    case "get_flowchart_file": {
      const target = resolveFlowChartTarget(args, context);
      const query = new URLSearchParams({ workspacePath: target.workspacePath });
      return fetchJson<FlowChartFileResponse>(
        `${desktopHostUrl}/api/workspace/flowcharts/files/${encodeFlowChartRelativePath(target.relativePath)}?${query.toString()}`,
      );
    }
    case "get_active_editor_context": {
      if (!context) {
        throw new Error("当前未收到桌面端编辑器上下文。请确认 LightyDesign 已启动且至少打开过一个工作区。");
      }

      return context;
    }
    case "create_workbook": {
      const workspacePath = resolveWorkspacePath(args, context);
      const workbookName = getString(args.workbookName);
      if (!workbookName) {
        throw new Error("create_workbook 缺少 workbookName 参数。");
      }

      return postJson(`${desktopHostUrl}/api/workspace/workbooks/create`, {
        workspacePath,
        workbookName,
      });
    }
    case "create_sheet": {
      const workspacePath = resolveWorkspacePath(args, context);
      const workbookName = getString(args.workbookName) ?? getString(asRecord(context?.currentSheet).workbookName);
      const sheetName = getString(args.sheetName);
      if (!workbookName) {
        throw new Error("create_sheet 缺少 workbookName 参数。");
      }
      if (!sheetName) {
        throw new Error("create_sheet 缺少 sheetName 参数。");
      }

      return postJson(`${desktopHostUrl}/api/workspace/workbooks/sheets/create`, {
        workspacePath,
        workbookName,
        sheetName,
      });
    }
    case "save_flowchart_file": {
      const target = resolveFlowChartTarget(args, context);
      const document = requireJsonObject(args.document, "save_flowchart_file 缺少 document 参数，或 document 不是 JSON 对象。");
      return postJson<FlowChartFileResponse>(`${desktopHostUrl}/api/workspace/flowcharts/files/save`, {
        workspacePath: target.workspacePath,
        relativePath: target.relativePath,
        document,
      });
    }
    case "export_flowchart_codegen":
      return exportFlowChartCodegen(args, context);
    case "patch_sheet_rows":
      return patchSheetRows(args, context);
    case "patch_sheet_columns":
      return patchSheetColumns(args, context);
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

async function createJsonRpcResponse(message: JsonRpcRequest): Promise<JsonRpcResponse> {
  if (message.method === "initialize") {
    return createResult(message.id ?? null, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo,
    });
  }

  if (message.method === "ping") {
    return createResult(message.id ?? null, {});
  }

  if (message.method === "tools/list") {
    return createResult(message.id ?? null, { tools });
  }

  if (message.method === "tools/call") {
    const params = asRecord(message.params);
    const name = getString(params.name);
    if (!name) {
      return createError(message.id ?? null, -32602, "tools/call 缺少 name 参数。");
    }

    try {
      const result = await handleToolCall(name, params.arguments);
      return createResult(message.id ?? null, buildToolResult(result));
    } catch (error) {
      return createError(message.id ?? null, -32000, error instanceof Error ? error.message : `工具调用失败: ${name}`);
    }
  }

  return createError(message.id ?? null, -32601, `不支持的方法: ${message.method}`);
}

async function handleRequest(message: JsonRpcRequest) {
  const response = await createJsonRpcResponse(message);
  sendMessage(response);
}

function tryReadMessageFromBuffer() {
  const headerEndIndex = inputBuffer.indexOf("\r\n\r\n");
  if (headerEndIndex < 0) {
    return null;
  }

  const headerText = inputBuffer.slice(0, headerEndIndex).toString("utf8");
  const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!contentLengthMatch) {
    inputBuffer = inputBuffer.slice(headerEndIndex + 4);
    return null;
  }

  const contentLength = Number.parseInt(contentLengthMatch[1] ?? "0", 10);
  const bodyStartIndex = headerEndIndex + 4;
  const bodyEndIndex = bodyStartIndex + contentLength;
  if (inputBuffer.length < bodyEndIndex) {
    return null;
  }

  const messageBuffer = inputBuffer.slice(bodyStartIndex, bodyEndIndex);
  inputBuffer = inputBuffer.slice(bodyEndIndex);
  return JSON.parse(messageBuffer.toString("utf8")) as JsonRpcRequest;
}

function processInputBuffer() {
  while (true) {
    let message: JsonRpcRequest | null;

    try {
      message = tryReadMessageFromBuffer();
    } catch (error) {
      process.stderr.write(`[LightyDesign.McpServer] Failed to parse input: ${error instanceof Error ? error.message : String(error)}\n`);
      continue;
    }

    if (!message) {
      return;
    }

    if (typeof message.method !== "string") {
      if (message.id !== undefined) {
        sendError(message.id, -32600, "非法请求。缺少 method。");
      }
      continue;
    }

    if (message.id === undefined) {
      continue;
    }

    void handleRequest(message).catch((error) => {
      sendError(message.id ?? null, -32000, error instanceof Error ? error.message : "请求处理失败。");
    });
  }
}

function isOriginAllowed(origin: string | undefined) {
  if (!origin || origin === "null") {
    return true;
  }

  return origin.startsWith("vscode-file://")
    || origin.startsWith("vscode-webview://")
    || origin.startsWith("file://")
    || origin === "https://vscode.dev"
    || origin === "https://insiders.vscode.dev"
    || origin.startsWith("http://127.0.0.1")
    || origin.startsWith("http://localhost");
}

function sendJson(res: http.ServerResponse, statusCode: number, payload?: unknown) {
  if (payload === undefined) {
    res.writeHead(statusCode);
    res.end();
    return;
  }

  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function startHttpTransport() {
  const server = http.createServer(async (req, res) => {
    if (!isOriginAllowed(req.headers.origin)) {
      sendJson(res, 403, {
        error: "Origin is not allowed.",
      });
      return;
    }

    const requestUrl = new URL(req.url ?? "/", `http://${httpHost}:${httpPort}`);
    if (req.method === "GET" && requestUrl.pathname === `${httpPath}/health`) {
      sendJson(res, 200, {
        ok: true,
        transport: "http",
        url: `http://${httpHost}:${httpPort}${httpPath}`,
      });
      return;
    }

    if (requestUrl.pathname !== httpPath) {
      sendJson(res, 404, {
        error: "Not Found",
      });
      return;
    }

    if (req.method === "GET") {
      res.writeHead(405, {
        Allow: "POST",
      });
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, {
        Allow: "POST",
      });
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", async () => {
      let message: JsonRpcRequest;

      try {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        message = JSON.parse(bodyText) as JsonRpcRequest;
      } catch (error) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: error instanceof Error ? error.message : "Invalid JSON payload.",
          },
        });
        return;
      }

      if (typeof message?.method !== "string") {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "非法请求。缺少 method。",
          },
        });
        return;
      }

      if (message.id === undefined) {
        res.writeHead(202, {
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }

      try {
        const response = await createJsonRpcResponse(message);
        sendJson(res, 200, response);
      } catch (error) {
        sendJson(res, 500, createError(message.id ?? null, -32000, error instanceof Error ? error.message : "请求处理失败。"));
      }
    });

    req.on("error", (error) => {
      sendJson(res, 500, {
        error: error.message,
      });
    });
  });

  server.on("error", (error) => {
    process.stderr.write(`[LightyDesign.McpServer] http server error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

  server.listen(httpPort, httpHost, () => {
    process.stderr.write(
      `[LightyDesign.McpServer] ready. transport=http url=http://${httpHost}:${httpPort}${httpPath} context=${editorContextFilePath || "<unset>"}\n`,
    );
  });
}

function startStdioTransport() {
  process.stdin.on("data", (chunk: Buffer) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    processInputBuffer();
  });

  process.stdin.resume();
  process.stderr.write(`[LightyDesign.McpServer] ready. transport=stdio host=${desktopHostUrl} context=${editorContextFilePath || "<unset>"}\n`);
}

if (transportMode === "http") {
  startHttpTransport();
} else {
  startStdioTransport();
}
