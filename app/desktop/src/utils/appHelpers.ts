import { getSelectionBounds, type SheetColumn, type SheetSelectionRange } from "../types/desktopApp";

const contextMenuViewportMargin = 8;

let textMeasureCanvas: HTMLCanvasElement | null = null;

export function normalizeMcpConfigPath(pathValue: string) {
  const trimmedValue = pathValue.trim();
  if (!trimmedValue) {
    return "/mcp";
  }

  return trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
}

export function buildVsCodeMcpConfigJson(serverUrl: string) {
  return JSON.stringify(
    {
      servers: {
        lightydesign: {
          type: "http",
          url: serverUrl,
        },
      },
    },
    null,
    2,
  );
}

export function getMcpRuntimeStatusLabel(mcpPreferences: McpPreferences | null) {
  if (!mcpPreferences) {
    return "状态未知";
  }

  if (!mcpPreferences.enabled) {
    return "已关闭";
  }

  switch (mcpPreferences.runtimeStatus) {
    case "running":
      return "运行中";
    case "starting":
      return "启动中";
    case "error":
      return "启动失败";
    default:
      return "已关闭";
  }
}

export function measureTextWidth(text: string, font = '12px "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif') {
  if (typeof document === "undefined") {
    return text.length * 8;
  }

  if (!textMeasureCanvas) {
    textMeasureCanvas = document.createElement("canvas");
  }

  const context = textMeasureCanvas.getContext("2d");
  if (!context) {
    return text.length * 8;
  }

  context.font = font;
  return context.measureText(text).width;
}

function getExcelColumnName(columnIndex: number) {
  let current = columnIndex + 1;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

export function formatSelectionAddress(range: SheetSelectionRange) {
  const bounds = getSelectionBounds(range);
  const startAddress = `${getExcelColumnName(bounds.startColumnIndex)}${bounds.startRowIndex + 1}`;
  const endAddress = `${getExcelColumnName(bounds.endColumnIndex)}${bounds.endRowIndex + 1}`;

  return startAddress === endAddress ? startAddress : `${startAddress}:${endAddress}`;
}

export function parseClipboardMatrix(clipboardText: string) {
  const normalizedText = clipboardText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = normalizedText.split("\n");

  if (rows.at(-1) === "") {
    rows.pop();
  }

  return rows.map((row) => row.split("\t"));
}

function getPositiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function buildRepeatedFillValue(sourceMatrix: string[][], sourceStartVisibleIndex: number, visibleRowIndex: number, startColumnIndex: number, columnIndex: number) {
  const sourceRowCount = sourceMatrix.length;
  const sourceColumnCount = sourceMatrix[0]?.length ?? 0;
  if (sourceRowCount <= 0 || sourceColumnCount <= 0) {
    return "";
  }

  const sourceRowOffset = getPositiveModulo(visibleRowIndex - sourceStartVisibleIndex, sourceRowCount);
  const sourceColumnOffset = getPositiveModulo(columnIndex - startColumnIndex, sourceColumnCount);
  return sourceMatrix[sourceRowOffset]?.[sourceColumnOffset] ?? "";
}

function normalizeDirectoryPath(path: string) {
  return path.replace(/[\\/]+/g, "\\").replace(/[\\/]+$/, "");
}

export function tryGetWorkspaceRelativePath(workspaceRoot: string, absolutePath: string) {
  const normalizedWorkspaceRoot = normalizeDirectoryPath(workspaceRoot);
  const normalizedAbsolutePath = normalizeDirectoryPath(absolutePath);
  const workspaceRootSegments = normalizedWorkspaceRoot.split("\\").filter((segment) => segment.length > 0);
  const absolutePathSegments = normalizedAbsolutePath.split("\\").filter((segment) => segment.length > 0);

  if (workspaceRootSegments.length === 0 || absolutePathSegments.length === 0) {
    return null;
  }

  if (workspaceRootSegments[0]?.toLowerCase() !== absolutePathSegments[0]?.toLowerCase()) {
    return null;
  }

  if (normalizedAbsolutePath.toLowerCase() === normalizedWorkspaceRoot.toLowerCase()) {
    return "";
  }

  let sharedLength = 0;
  const maxSharedLength = Math.min(workspaceRootSegments.length, absolutePathSegments.length);

  while (
    sharedLength < maxSharedLength &&
    workspaceRootSegments[sharedLength]?.toLowerCase() === absolutePathSegments[sharedLength]?.toLowerCase()
  ) {
    sharedLength += 1;
  }

  const upwardSegments = Array.from({ length: workspaceRootSegments.length - sharedLength }, () => "..");
  const downwardSegments = absolutePathSegments.slice(sharedLength);
  return [...upwardSegments, ...downwardSegments].join("/");
}

export function formatByteSize(byteCount: number | null | undefined) {
  if (!byteCount || byteCount <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = byteCount;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function clampContextMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  containerRect?: DOMRect | null,
) {
  const boundsLeft = containerRect?.left ?? 0;
  const boundsTop = containerRect?.top ?? 0;
  const boundsRight = containerRect?.right ?? window.innerWidth;
  const boundsBottom = containerRect?.bottom ?? window.innerHeight;
  const minLeft = boundsLeft + contextMenuViewportMargin;
  const minTop = boundsTop + contextMenuViewportMargin;
  const maxLeft = Math.max(minLeft, boundsRight - menuWidth - contextMenuViewportMargin);
  const maxTop = Math.max(minTop, boundsBottom - menuHeight - contextMenuViewportMargin);

  return {
    x: Math.min(Math.max(x, minLeft), maxLeft),
    y: Math.min(Math.max(y, minTop), maxTop),
  };
}

export function cloneSheetColumnSnapshot(column: SheetColumn): SheetColumn {
  return {
    ...column,
    attributes: { ...column.attributes },
  };
}