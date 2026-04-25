import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";

import { NumericCellInput } from "./NumericCellInput";

import {
  getColumnExportScope,
  getNumericColumnKindFromType,
  type NumericColumnKind,
  type SheetColumn,
  type SheetResponse,
  type TypeDescriptorResponse,
  type TypeValidationResponse,
} from "../types/desktopApp";

type CellValueEditorDialogProps = {
  cellAddress: string;
  column: SheetColumn | null;
  initialValue: string;
  isOpen: boolean;
  onApply: (nextValue: string) => void;
  onClose: () => void;
  onLoadReferenceSheet: (workbookName: string, sheetName: string) => Promise<SheetResponse>;
  onResolveType: (type: string) => Promise<TypeValidationResponse>;
};

type CompositeValueSchema =
  | {
      kind: "scalar";
      rawType: string;
      scalarType: string;
      numericKind: NumericColumnKind | null;
      booleanLike: boolean;
    }
  | {
      kind: "reference";
      rawType: string;
      workbookName: string;
      sheetName: string;
    }
  | {
      kind: "list";
      rawType: string;
      elementSchema: CompositeValueSchema;
    }
  | {
      kind: "dictionary";
      rawType: string;
      keySchema: CompositeValueSchema;
      valueSchema: CompositeValueSchema;
    }
  | {
      kind: "object";
      rawType: string;
      message: string;
    };

type CompositeValueDraft =
  | {
      kind: "scalar";
      text: string;
    }
  | {
      kind: "reference";
      text: string;
    }
  | {
      kind: "list";
      items: CompositeValueDraft[];
    }
  | {
      kind: "dictionary";
      entries: Array<{
        key: CompositeValueDraft;
        value: CompositeValueDraft;
      }>;
    }
  | {
      kind: "object";
      jsonText: string;
    };

type DraftInitializationResult = {
  draft: CompositeValueDraft;
  initialJsonText: string;
  warning: string | null;
};

type ValidationResult =
  | {
      ok: true;
      text: string;
      blank?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

type ReferenceSheetState =
  | {
      status: "idle" | "loading";
      data: null;
      error: null;
    }
  | {
      status: "ready";
      data: SheetResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

type ChildDialogState = {
  initialDraft: CompositeValueDraft;
  initialJsonText: string;
  schema: CompositeValueSchema;
  subtitle: string;
  title: string;
  warning: string | null;
  onApply: (nextDraft: CompositeValueDraft) => void;
};

type ReferenceRowOption = {
  detail: string;
  label: string;
  value: string;
};

function cloneDraftValue(draft: CompositeValueDraft): CompositeValueDraft {
  switch (draft.kind) {
    case "scalar":
      return {
        kind: "scalar",
        text: draft.text,
      };
    case "reference":
      return {
        kind: "reference",
        text: draft.text,
      };
    case "list":
      return {
        kind: "list",
        items: draft.items.map(cloneDraftValue),
      };
    case "dictionary":
      return {
        kind: "dictionary",
        entries: draft.entries.map((entry) => ({
          key: cloneDraftValue(entry.key),
          value: cloneDraftValue(entry.value),
        })),
      };
    case "object":
      return {
        kind: "object",
        jsonText: draft.jsonText,
      };
    default:
      return draft;
  }
}

function buildSchemaFromDescriptor(descriptor: TypeDescriptorResponse): CompositeValueSchema {
  if (descriptor.isList) {
    return {
      kind: "list",
      rawType: descriptor.rawType,
      elementSchema: descriptor.children[0] ? buildSchemaFromDescriptor(descriptor.children[0]) : {
        kind: "scalar",
        rawType: "string",
        scalarType: "string",
        numericKind: null,
        booleanLike: false,
      },
    };
  }

  if (descriptor.isDictionary) {
    return {
      kind: "dictionary",
      rawType: descriptor.rawType,
      keySchema: descriptor.children[0] ? buildSchemaFromDescriptor(descriptor.children[0]) : {
        kind: "scalar",
        rawType: "string",
        scalarType: "string",
        numericKind: null,
        booleanLike: false,
      },
      valueSchema: descriptor.children[1] ? buildSchemaFromDescriptor(descriptor.children[1]) : {
        kind: "scalar",
        rawType: "string",
        scalarType: "string",
        numericKind: null,
        booleanLike: false,
      },
    };
  }

  if (descriptor.isReference) {
    return {
      kind: "reference",
      rawType: descriptor.rawType,
      workbookName: descriptor.referenceTarget?.workbookName ?? "",
      sheetName: descriptor.referenceTarget?.sheetName ?? "",
    };
  }

  if (/^object$/i.test(descriptor.typeName.trim())) {
    return {
      kind: "object",
      rawType: descriptor.rawType,
      message: "当前工作区尚未提供 object 字段 schema，先通过 JSON 视角编辑。",
    };
  }

  return {
    kind: "scalar",
    rawType: descriptor.rawType,
    scalarType: descriptor.rawType,
    numericKind: getNumericColumnKindFromType(descriptor.rawType),
    booleanLike: /^bool(ean)?$/i.test(descriptor.rawType.trim()),
  };
}

function buildDefaultDraft(schema: CompositeValueSchema): CompositeValueDraft {
  switch (schema.kind) {
    case "scalar":
      return {
        kind: "scalar",
        text: schema.booleanLike ? "false" : schema.numericKind ? "0" : "",
      };
    case "reference":
      return {
        kind: "reference",
        text: "",
      };
    case "list":
      return {
        kind: "list",
        items: [],
      };
    case "dictionary":
      return {
        kind: "dictionary",
        entries: [],
      };
    case "object":
      return {
        kind: "object",
        jsonText: "{}",
      };
    default:
      return {
        kind: "scalar",
        text: "",
      };
  }
}

function getSchemaEditorTitle(schema: CompositeValueSchema) {
  switch (schema.kind) {
    case "scalar":
      return schema.numericKind ? "编辑数值" : schema.booleanLike ? "编辑布尔值" : "编辑值";
    case "reference":
      return "编辑引用";
    case "list":
      return "编辑列表";
    case "dictionary":
      return "编辑字典";
    case "object":
      return "编辑对象";
    default:
      return "编辑值";
  }
}

function isStringScalarSchema(schema: CompositeValueSchema) {
  return schema.kind === "scalar" && !schema.numericKind && !schema.booleanLike && /^string$/i.test(schema.scalarType.trim());
}

function truncateText(value: string, maxLength = 52) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function tryParseReferenceIdentifiers(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) {
    return null;
  }

  const content = trimmed.slice(2, -2).trim();
  if (!content) {
    return null;
  }

  const identifiers = content
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return identifiers.length > 0 ? identifiers : null;
}

function normalizeReferenceText(value: string) {
  const identifiers = tryParseReferenceIdentifiers(value);
  return identifiers ? `[[${identifiers.join(",") }]]`.replace(", ", ",") : value.trim();
}

function buildDraftFromJsonPropertyName(schema: CompositeValueSchema, propertyName: string): CompositeValueDraft {
  if (schema.kind === "reference") {
    return {
      kind: "reference",
      text: propertyName,
    };
  }

  return {
    kind: "scalar",
    text: propertyName,
  };
}

function parseJsonValueToDraft(schema: CompositeValueSchema, value: unknown, path = "$"): { ok: true; draft: CompositeValueDraft } | { ok: false; error: string } {
  switch (schema.kind) {
    case "scalar": {
      if (schema.booleanLike) {
        if (typeof value !== "boolean") {
          return {
            ok: false,
            error: `${path} 需要 JSON 布尔值。`,
          };
        }

        return {
          ok: true,
          draft: {
            kind: "scalar",
            text: value ? "true" : "false",
          },
        };
      }

      if (schema.numericKind) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return {
            ok: false,
            error: `${path} 需要 JSON 数字。`,
          };
        }

        return {
          ok: true,
          draft: {
            kind: "scalar",
            text: String(value),
          },
        };
      }

      if (typeof value !== "string") {
        return {
          ok: false,
          error: `${path} 需要 JSON 字符串。`,
        };
      }

      return {
        ok: true,
        draft: {
          kind: "scalar",
          text: value,
        },
      };
    }
    case "reference": {
      if (typeof value !== "string") {
        return {
          ok: false,
          error: `${path} 需要 JSON 字符串形式的引用值。`,
        };
      }

      if (!tryParseReferenceIdentifiers(value)) {
        return {
          ok: false,
          error: `${path} 不是合法引用，格式应为 [[id]] 或 [[id1,id2]]。`,
        };
      }

      return {
        ok: true,
        draft: {
          kind: "reference",
          text: normalizeReferenceText(value),
        },
      };
    }
    case "list": {
      if (!Array.isArray(value)) {
        return {
          ok: false,
          error: `${path} 需要 JSON 数组。`,
        };
      }

      const items: CompositeValueDraft[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const itemResult = parseJsonValueToDraft(schema.elementSchema, value[index], `${path}[${index}]`);
        if (!itemResult.ok) {
          return itemResult;
        }

        items.push(itemResult.draft);
      }

      return {
        ok: true,
        draft: {
          kind: "list",
          items,
        },
      };
    }
    case "dictionary": {
      const entries: Array<{ key: CompositeValueDraft; value: CompositeValueDraft }> = [];

      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const entry = value[index];
          if (typeof entry !== "object" || entry === null || Array.isArray(entry) || !Object.prototype.hasOwnProperty.call(entry, "key") || !Object.prototype.hasOwnProperty.call(entry, "value")) {
            return {
              ok: false,
              error: `${path}[${index}] 需要形如 {\"key\":...,\"value\":...} 的对象。`,
            };
          }

          const record = entry as { key: unknown; value: unknown };
          const keyResult = parseJsonValueToDraft(schema.keySchema, record.key, `${path}[${index}].key`);
          if (!keyResult.ok) {
            return keyResult;
          }

          const valueResult = parseJsonValueToDraft(schema.valueSchema, record.value, `${path}[${index}].value`);
          if (!valueResult.ok) {
            return valueResult;
          }

          entries.push({
            key: keyResult.draft,
            value: valueResult.draft,
          });
        }

        return {
          ok: true,
          draft: {
            kind: "dictionary",
            entries,
          },
        };
      }

      if (typeof value === "object" && value !== null) {
        for (const [propertyName, propertyValue] of Object.entries(value as Record<string, unknown>)) {
          const keyDraft = isStringScalarSchema(schema.keySchema)
            ? {
                kind: "scalar" as const,
                text: propertyName,
              }
            : buildDraftFromJsonPropertyName(schema.keySchema, propertyName);

          const keyValidation = serializeDraftToJsonFragment(schema.keySchema, keyDraft, `${path}.${propertyName}`);
          if (!keyValidation.ok) {
            return {
              ok: false,
              error: keyValidation.error,
            };
          }

          const valueResult = parseJsonValueToDraft(schema.valueSchema, propertyValue, `${path}.${propertyName}`);
          if (!valueResult.ok) {
            return valueResult;
          }

          entries.push({
            key: keyDraft,
            value: valueResult.draft,
          });
        }

        return {
          ok: true,
          draft: {
            kind: "dictionary",
            entries,
          },
        };
      }

      return {
        ok: false,
        error: `${path} 需要 JSON 对象或键值对数组。`,
      };
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
          ok: false,
          error: `${path} 需要 JSON 对象。`,
        };
      }

      return {
        ok: true,
        draft: {
          kind: "object",
          jsonText: JSON.stringify(value),
        },
      };
    }
    default:
      return {
        ok: false,
        error: `${path} 暂不支持当前类型。`,
      };
  }
}

function buildInitialDraftState(schema: CompositeValueSchema, rawValue: string): DraftInitializationResult {
  const trimmedValue = rawValue.trim();

  if (schema.kind === "list") {
    if (!trimmedValue) {
      return {
        draft: {
          kind: "list",
          items: [],
        },
        initialJsonText: "[]",
        warning: null,
      };
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      const draftResult = parseJsonValueToDraft(schema, parsed);
      if (draftResult.ok) {
        return {
          draft: draftResult.draft,
          initialJsonText: rawValue,
          warning: null,
        };
      }

        return {
          draft: {
            kind: "list",
            items: [],
          },
          initialJsonText: rawValue,
          warning: draftResult.error,
        };
    } catch {
      return {
        draft: {
          kind: "list",
          items: [],
        },
        initialJsonText: rawValue,
        warning: "当前值不是合法 JSON，结构化视角会从空列表开始修复。",
      };
    }
  }

  if (schema.kind === "dictionary") {
    if (!trimmedValue) {
      return {
        draft: {
          kind: "dictionary",
          entries: [],
        },
        initialJsonText: isStringScalarSchema(schema.keySchema) ? "{}" : "[]",
        warning: null,
      };
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      const draftResult = parseJsonValueToDraft(schema, parsed);
      if (draftResult.ok) {
        return {
          draft: draftResult.draft,
          initialJsonText: rawValue,
          warning: null,
        };
      }

        return {
          draft: {
            kind: "dictionary",
            entries: [],
          },
          initialJsonText: rawValue,
          warning: draftResult.error,
        };
    } catch {
      return {
        draft: {
          kind: "dictionary",
          entries: [],
        },
        initialJsonText: rawValue,
        warning: "当前值不是合法 JSON，结构化视角会从空字典开始修复。",
      };
    }
  }

  if (schema.kind === "object") {
    if (!trimmedValue) {
      return {
        draft: {
          kind: "object",
          jsonText: "{}",
        },
        initialJsonText: "{}",
        warning: schema.message,
      };
    }

    try {
      JSON.parse(rawValue);
      return {
        draft: {
          kind: "object",
          jsonText: rawValue,
        },
        initialJsonText: rawValue,
        warning: schema.message,
      };
    } catch {
      return {
        draft: {
          kind: "object",
          jsonText: rawValue,
        },
        initialJsonText: rawValue,
        warning: `${schema.message} 当前值不是合法 JSON。`,
      };
    }
  }

  if (schema.kind === "reference") {
    return {
      draft: {
        kind: "reference",
        text: rawValue.trim(),
      },
      initialJsonText: JSON.stringify(rawValue.trim()),
      warning: rawValue.trim() && !tryParseReferenceIdentifiers(rawValue) ? "当前值不是合法引用，格式应为 [[id]] 或 [[id1,id2]]。" : null,
    };
  }

  return {
    draft: {
      kind: "scalar",
      text: schema.numericKind || schema.booleanLike ? rawValue.trim() : rawValue,
    },
    initialJsonText: schema.numericKind || schema.booleanLike ? rawValue.trim() : JSON.stringify(rawValue),
    warning: null,
  };
}

function serializeDraftToJsonFragment(
  schema: CompositeValueSchema,
  draft: CompositeValueDraft,
  path: string,
): ValidationResult {
  if (schema.kind === "object") {
    if (draft.kind !== "object") {
      return {
        ok: false,
        error: `${path} 的草稿类型不匹配。`,
      };
    }

    try {
      const parsed = JSON.parse(draft.jsonText) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {
          ok: false,
          error: `${path} 需要 JSON 对象。`,
        };
      }

      return {
        ok: true,
        text: JSON.stringify(parsed),
      };
    } catch {
      return {
        ok: false,
        error: `${path} 不是合法 JSON。`,
      };
    }
  }

  if (schema.kind === "reference") {
    if (draft.kind !== "reference") {
      return {
        ok: false,
        error: `${path} 的草稿类型不匹配。`,
      };
    }

    const normalized = draft.text.trim();
    if (!normalized) {
      return {
        ok: false,
        error: `${path} 不能为空。`,
      };
    }

    const identifiers = tryParseReferenceIdentifiers(normalized);
    if (!identifiers) {
      return {
        ok: false,
        error: `${path} 不是合法引用，格式应为 [[id]] 或 [[id1,id2]]。`,
      };
    }

    return {
      ok: true,
      text: JSON.stringify(`[[${identifiers.join(",") }]]`.replace(", ", ",")),
    };
  }

  if (schema.kind === "scalar") {
    if (draft.kind !== "scalar") {
      return {
        ok: false,
        error: `${path} 的草稿类型不匹配。`,
      };
    }

    if (schema.booleanLike) {
      const normalized = draft.text.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        return {
          ok: false,
          error: `${path} 需要 true 或 false。`,
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    if (schema.numericKind === "integer") {
      const normalized = draft.text.trim();
      if (!/^[+-]?\d+$/.test(normalized)) {
        return {
          ok: false,
          error: `${path} 需要整数。`,
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    if (schema.numericKind === "decimal") {
      const normalized = draft.text.trim();
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
        return {
          ok: false,
          error: `${path} 需要合法数字。`,
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    return {
      ok: true,
      text: JSON.stringify(draft.text),
    };
  }

  if (schema.kind === "list") {
    if (draft.kind !== "list") {
      return {
        ok: false,
        error: `${path} 的草稿类型不匹配。`,
      };
    }

    const itemTexts: string[] = [];
    for (let index = 0; index < draft.items.length; index += 1) {
      const itemResult = serializeDraftToJsonFragment(schema.elementSchema, draft.items[index], `${path}[${index}]`);
      if (!itemResult.ok) {
        return itemResult;
      }

      itemTexts.push(itemResult.text);
    }

    return {
      ok: true,
      text: `[${itemTexts.join(",")}]`,
    };
  }

  if (schema.kind === "dictionary") {
    if (draft.kind !== "dictionary") {
      return {
        ok: false,
        error: `${path} 的草稿类型不匹配。`,
      };
    }

    if (isStringScalarSchema(schema.keySchema)) {
      const objectEntries: string[] = [];
      const usedKeys = new Set<string>();

      for (let index = 0; index < draft.entries.length; index += 1) {
        const entry = draft.entries[index];
        const keyResult = serializeDraftToJsonFragment(schema.keySchema, entry.key, `${path}[${index}].key`);
        if (!keyResult.ok) {
          return keyResult;
        }

        const parsedKey = JSON.parse(keyResult.text) as string;
        if (usedKeys.has(parsedKey)) {
          return {
            ok: false,
            error: `${path} 存在重复字典键 '${parsedKey}'。`,
          };
        }

        usedKeys.add(parsedKey);

        const valueResult = serializeDraftToJsonFragment(schema.valueSchema, entry.value, `${path}[${index}].value`);
        if (!valueResult.ok) {
          return valueResult;
        }

        objectEntries.push(`${JSON.stringify(parsedKey)}:${valueResult.text}`);
      }

      return {
        ok: true,
        text: `{${objectEntries.join(",")}}`,
      };
    }

    const serializedEntries: string[] = [];
    for (let index = 0; index < draft.entries.length; index += 1) {
      const entry = draft.entries[index];
      const keyResult = serializeDraftToJsonFragment(schema.keySchema, entry.key, `${path}[${index}].key`);
      if (!keyResult.ok) {
        return keyResult;
      }

      const valueResult = serializeDraftToJsonFragment(schema.valueSchema, entry.value, `${path}[${index}].value`);
      if (!valueResult.ok) {
        return valueResult;
      }

      serializedEntries.push(`{"key":${keyResult.text},"value":${valueResult.text}}`);
    }

    return {
      ok: true,
      text: `[${serializedEntries.join(",")}]`,
    };
  }

  return {
    ok: false,
    error: `${path} 暂不支持当前类型。`,
  };
}

function serializeRootDraftToCellValue(schema: CompositeValueSchema, draft: CompositeValueDraft): ValidationResult {
  if (schema.kind === "list" || schema.kind === "dictionary" || schema.kind === "object") {
    return serializeDraftToJsonFragment(schema, draft, "$");
  }

  if (schema.kind === "reference") {
    if (draft.kind !== "reference") {
      return {
        ok: false,
        error: "当前草稿类型不匹配。",
      };
    }

    const normalized = draft.text.trim();
    if (!normalized) {
      return {
        ok: true,
        text: "",
        blank: true,
      };
    }

    const identifiers = tryParseReferenceIdentifiers(normalized);
    if (!identifiers) {
      return {
        ok: false,
        error: "引用格式应为 [[id]] 或 [[id1,id2]]。",
      };
    }

    return {
      ok: true,
      text: `[[${identifiers.join(",") }]]`.replace(", ", ","),
    };
  }

  if (schema.kind === "scalar") {
    if (draft.kind !== "scalar") {
      return {
        ok: false,
        error: "当前草稿类型不匹配。",
      };
    }

    if (schema.booleanLike) {
      const normalized = draft.text.trim().toLowerCase();
      if (!normalized) {
        return {
          ok: true,
          text: "",
          blank: true,
        };
      }

      if (normalized !== "true" && normalized !== "false") {
        return {
          ok: false,
          error: "布尔值只能是 true 或 false。",
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    if (schema.numericKind === "integer") {
      const normalized = draft.text.trim();
      if (!normalized) {
        return {
          ok: true,
          text: "",
          blank: true,
        };
      }

      if (!/^[+-]?\d+$/.test(normalized)) {
        return {
          ok: false,
          error: "请输入合法整数。",
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    if (schema.numericKind === "decimal") {
      const normalized = draft.text.trim();
      if (!normalized) {
        return {
          ok: true,
          text: "",
          blank: true,
        };
      }

      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
        return {
          ok: false,
          error: "请输入合法数字。",
        };
      }

      return {
        ok: true,
        text: normalized,
      };
    }

    return {
      ok: true,
      text: draft.text,
    };
  }

  return {
    ok: false,
    error: "当前类型暂不支持写回单元格。",
  };
}

function buildFallbackJsonText(schema: CompositeValueSchema) {
  switch (schema.kind) {
    case "list":
      return "[]";
    case "dictionary":
      return isStringScalarSchema(schema.keySchema) ? "{}" : "[]";
    case "object":
      return "{}";
    case "reference":
      return JSON.stringify("[[id]]");
    case "scalar":
      return schema.booleanLike ? "false" : schema.numericKind ? "0" : JSON.stringify("");
    default:
      return "{}";
  }
}

function formatDraftSummary(schema: CompositeValueSchema, draft: CompositeValueDraft) {
  if (schema.kind === "list" && draft.kind === "list") {
    return `${draft.items.length} 项`;
  }

  if (schema.kind === "dictionary" && draft.kind === "dictionary") {
    return `${draft.entries.length} 项`;
  }

  if (schema.kind === "reference" && draft.kind === "reference") {
    const identifiers = tryParseReferenceIdentifiers(draft.text);
    if (identifiers) {
      return identifiers.join(" / ");
    }

    return draft.text ? truncateText(draft.text) : "待填写";
  }

  if (schema.kind === "scalar" && draft.kind === "scalar") {
    return draft.text ? truncateText(draft.text) : schema.booleanLike ? "false" : "待填写";
  }

  if (schema.kind === "object") {
    return "JSON 对象";
  }

  return "待填写";
}

function buildReferenceKeyColumnIndices(columns: SheetColumn[]) {
  const exportedColumns = columns
    .map((column, index) => ({ column, index }))
    .filter((entry) => getColumnExportScope(entry.column).trim().toLowerCase() !== "none");

  const singleId = exportedColumns.find((entry) => entry.column.fieldName.trim().toLowerCase() === "id");
  if (singleId) {
    return [singleId.index];
  }

  const compositeIndices: number[] = [];
  for (let index = 1; index <= exportedColumns.length; index += 1) {
    const expected = `id${index}`;
    const field = exportedColumns.find((entry) => entry.column.fieldName.trim().toLowerCase() === expected);
    if (!field) {
      break;
    }

    compositeIndices.push(field.index);
  }

  if (compositeIndices.length > 0) {
    return compositeIndices;
  }

  return exportedColumns[0] ? [exportedColumns[0].index] : [];
}

function buildReferenceRowOptions(sheet: SheetResponse) {
  const keyColumnIndices = buildReferenceKeyColumnIndices(sheet.metadata.columns);
  if (keyColumnIndices.length === 0) {
    return [] as ReferenceRowOption[];
  }

  return sheet.rows.slice(0, 80).map((row, rowIndex) => {
    const identifiers = keyColumnIndices.map((columnIndex) => row[columnIndex] ?? "");
    const keyLabel = identifiers.some((identifier) => identifier.trim().length > 0)
      ? identifiers.join(" / ")
      : `第 ${rowIndex + 1} 行`;
    const detail = sheet.metadata.columns
      .map((column, columnIndex) => ({ column, columnIndex, value: row[columnIndex] ?? "" }))
      .filter((entry) => !keyColumnIndices.includes(entry.columnIndex) && entry.value.trim().length > 0)
      .slice(0, 3)
      .map((entry) => `${entry.column.displayName || entry.column.fieldName}: ${entry.value}`)
      .join(" · ");

    return {
      detail,
      label: keyLabel,
      value: `[[${identifiers.join(",") }]]`.replace(", ", ","),
    };
  });
}

function ReferenceValueEditor({
  draft,
  onChange,
  onLoadReferenceSheet,
  schema,
}: {
  draft: { kind: "reference"; text: string };
  onChange: (nextText: string) => void;
  onLoadReferenceSheet: (workbookName: string, sheetName: string) => Promise<SheetResponse>;
  schema: Extract<CompositeValueSchema, { kind: "reference" }>;
}) {
  const [sheetState, setSheetState] = useState<ReferenceSheetState>({
    status: "idle",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!schema.workbookName || !schema.sheetName) {
      setSheetState({
        status: "error",
        data: null,
        error: "当前引用类型没有有效的目标表。",
      });
      return;
    }

    let cancelled = false;
    setSheetState({
      status: "loading",
      data: null,
      error: null,
    });

    void onLoadReferenceSheet(schema.workbookName, schema.sheetName)
      .then((sheet) => {
        if (cancelled) {
          return;
        }

        setSheetState({
          status: "ready",
          data: sheet,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSheetState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "读取引用目标表失败。",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [onLoadReferenceSheet, schema.sheetName, schema.workbookName]);

  const options = useMemo(
    () => (sheetState.status === "ready" ? buildReferenceRowOptions(sheetState.data) : []),
    [sheetState],
  );

  return (
    <div className="cell-value-editor-reference">
      <label className="search-field column-editor-field compact-field">
        <span>引用值</span>
        <input
          className="dialog-field-input"
          onChange={(event) => onChange(event.target.value)}
          placeholder="[[id]] 或 [[id1,id2]]"
          spellCheck={false}
          type="text"
          value={draft.text}
        />
      </label>

      <p className="cell-value-editor-caption">目标表: {schema.workbookName}.{schema.sheetName}</p>

      {sheetState.status === "loading" ? <p className="cell-value-editor-caption">正在加载引用目标表...</p> : null}
      {sheetState.status === "error" ? <p className="column-editor-error">{sheetState.error}</p> : null}

      {sheetState.status === "ready" ? (
        <>
          <p className="cell-value-editor-caption">可直接从目标表主键候选中选择。当前仅展示前 80 行。</p>
          <div className="cell-value-editor-reference-list">
            {options.map((option) => (
              <button
                className={`cell-value-editor-reference-option${draft.text.trim() === option.value ? " is-active" : ""}`}
                key={`${option.value}-${option.label}`}
                onClick={() => onChange(option.value)}
                type="button"
              >
                <strong>{option.label}</strong>
                {option.detail ? <span>{option.detail}</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

type CompositeDraftDialogProps = {
  initialDraft: CompositeValueDraft;
  initialJsonText: string;
  isRoot: boolean;
  nestedDepth: number;
  onApplyDraft: (draft: CompositeValueDraft) => void;
  onClose: () => void;
  onLoadReferenceSheet: (workbookName: string, sheetName: string) => Promise<SheetResponse>;
  schema: CompositeValueSchema;
  subtitle: string;
  title: string;
  warning: string | null;
};

function CompositeDraftDialog({
  initialDraft,
  initialJsonText,
  isRoot,
  nestedDepth,
  onApplyDraft,
  onClose,
  onLoadReferenceSheet,
  schema,
  subtitle,
  title,
  warning,
}: CompositeDraftDialogProps) {
  const [childDialog, setChildDialog] = useState<ChildDialogState | null>(null);
  const [jsonText, setJsonText] = useState(initialJsonText);
  const [localDraft, setLocalDraft] = useState<CompositeValueDraft>(() => cloneDraftValue(initialDraft));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"structured" | "json">(schema.kind === "object" ? "json" : "structured");
  const supportsJsonView = schema.kind === "list" || schema.kind === "dictionary" || schema.kind === "object";

  useEffect(() => {
    setLocalDraft(cloneDraftValue(initialDraft));
    setJsonText(initialJsonText);
    setValidationMessage(null);
    setChildDialog(null);
    setViewMode(schema.kind === "object" ? "json" : "structured");
  }, [initialDraft, initialJsonText, schema.kind, title]);

  const summaryText = useMemo(() => formatDraftSummary(schema, localDraft), [localDraft, schema]);

  function openChildDialogForDraft(nextSchema: CompositeValueSchema, nextDraft: CompositeValueDraft, pathLabel: string, onApply: (draft: CompositeValueDraft) => void) {
    const serialized = nextSchema.kind === "object"
      ? nextDraft.kind === "object"
        ? nextDraft.jsonText
        : buildFallbackJsonText(nextSchema)
      : serializeDraftToJsonFragment(nextSchema, nextDraft, pathLabel);

    setChildDialog({
      initialDraft: cloneDraftValue(nextDraft),
      initialJsonText: typeof serialized === "object" && "ok" in serialized && serialized.ok ? serialized.text : buildFallbackJsonText(nextSchema),
      schema: nextSchema,
      subtitle: pathLabel,
      title: `${getSchemaEditorTitle(nextSchema)} / ${pathLabel}`,
      warning: null,
      onApply,
    });
  }

  function handleApply() {
    setValidationMessage(null);

    if (viewMode === "json") {
      if (schema.kind === "object") {
        try {
          const parsed = JSON.parse(jsonText) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            setValidationMessage("对象编辑器只接受 JSON 对象。");
            return;
          }

          onApplyDraft({
            kind: "object",
            jsonText,
          });
          return;
        } catch {
          setValidationMessage("当前 JSON 不是合法对象。");
          return;
        }
      }

      try {
        const parsed = JSON.parse(jsonText) as unknown;
        const draftResult = parseJsonValueToDraft(schema, parsed);
        if (draftResult.ok) {
          onApplyDraft(draftResult.draft);
          return;
        }

          setValidationMessage(draftResult.error);
          return;
      } catch {
        setValidationMessage("当前 JSON 无法解析。");
        return;
      }
    }

    const validationResult = isRoot ? serializeRootDraftToCellValue(schema, localDraft) : serializeDraftToJsonFragment(schema, localDraft, "$");
    if (validationResult.ok) {
      onApplyDraft(cloneDraftValue(localDraft));
      return;
    }

      setValidationMessage(validationResult.error);
      return;
  }

  function renderStructuredEditor() {
    if (schema.kind === "object") {
      return (
        <div className="cell-value-editor-pane">
          <p className="cell-value-editor-caption">{schema.message}</p>
          <textarea
            className="dialog-field-input column-editor-textarea cell-value-editor-json-textarea"
            onChange={(event) => {
              setLocalDraft({
                kind: "object",
                jsonText: event.target.value,
              });
            }}
            rows={12}
            spellCheck={false}
            value={localDraft.kind === "object" ? localDraft.jsonText : jsonText}
          />
        </div>
      );
    }

    if (schema.kind === "reference" && localDraft.kind === "reference") {
      return (
        <ReferenceValueEditor
          draft={localDraft}
          onChange={(nextText) => {
            setLocalDraft({
              kind: "reference",
              text: nextText,
            });
          }}
          onLoadReferenceSheet={onLoadReferenceSheet}
          schema={schema}
        />
      );
    }

    if (schema.kind === "scalar" && localDraft.kind === "scalar") {
      if (schema.numericKind) {
        return (
          <div className="cell-value-editor-pane">
            <label className="search-field column-editor-field compact-field">
              <span>{schema.rawType}</span>
              <NumericCellInput
                className="dialog-field-input is-number"
                numericKind={schema.numericKind}
                onChangeValue={(nextValue) => {
                  setLocalDraft({
                    kind: "scalar",
                    text: nextValue,
                  });
                }}
                spellCheck={false}
                value={localDraft.text}
              />
            </label>
          </div>
        );
      }

      if (schema.booleanLike) {
        return (
          <div className="cell-value-editor-pane">
            <label className="search-field column-editor-field compact-field">
              <span>{schema.rawType}</span>
              <select
                className="dialog-field-select"
                onChange={(event) => {
                  setLocalDraft({
                    kind: "scalar",
                    text: event.target.value,
                  });
                }}
                value={localDraft.text.toLowerCase() === "true" ? "true" : localDraft.text.toLowerCase() === "false" ? "false" : ""}
              >
                <option value="">(empty)</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>
        );
      }

      return (
        <div className="cell-value-editor-pane">
          <label className="search-field column-editor-field compact-field">
            <span>{schema.rawType}</span>
            <input
              className="dialog-field-input"
              onChange={(event) => {
                setLocalDraft({
                  kind: "scalar",
                  text: event.target.value,
                });
              }}
              spellCheck={false}
              type="text"
              value={localDraft.text}
            />
          </label>
        </div>
      );
    }

    if (schema.kind === "list" && localDraft.kind === "list") {
      return (
        <div className="cell-value-editor-pane">
          <div className="cell-value-editor-entry-list">
            {localDraft.items.map((item, index) => (
              <section className="cell-value-editor-entry" key={`item-${index}`}>
                <div className="cell-value-editor-entry-header">
                  <strong>元素 {index + 1}</strong>
                  <span>{formatDraftSummary(schema.elementSchema, item)}</span>
                </div>
                <div className="cell-value-editor-entry-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      openChildDialogForDraft(schema.elementSchema, item, `${subtitle}[${index}]`, (nextDraft) => {
                        setLocalDraft((current) => current.kind === "list"
                          ? {
                              kind: "list",
                              items: current.items.map((entry, entryIndex) => (entryIndex === index ? nextDraft : entry)),
                            }
                          : current);
                      });
                    }}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setLocalDraft((current) => current.kind === "list"
                        ? {
                            kind: "list",
                            items: current.items.flatMap((entry, entryIndex) => entryIndex === index ? [entry, cloneDraftValue(entry)] : [entry]),
                          }
                        : current);
                    }}
                    type="button"
                  >
                    复制
                  </button>
                  <button
                    className="secondary-button"
                    disabled={index === 0}
                    onClick={() => {
                      setLocalDraft((current) => {
                        if (current.kind !== "list" || index === 0) {
                          return current;
                        }

                        const items = [...current.items];
                        [items[index - 1], items[index]] = [items[index], items[index - 1]];
                        return {
                          kind: "list",
                          items,
                        };
                      });
                    }}
                    type="button"
                  >
                    上移
                  </button>
                  <button
                    className="secondary-button"
                    disabled={index >= localDraft.items.length - 1}
                    onClick={() => {
                      setLocalDraft((current) => {
                        if (current.kind !== "list" || index >= current.items.length - 1) {
                          return current;
                        }

                        const items = [...current.items];
                        [items[index], items[index + 1]] = [items[index + 1], items[index]];
                        return {
                          kind: "list",
                          items,
                        };
                      });
                    }}
                    type="button"
                  >
                    下移
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setLocalDraft((current) => current.kind === "list"
                        ? {
                            kind: "list",
                            items: current.items.filter((_, entryIndex) => entryIndex !== index),
                          }
                        : current);
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </section>
            ))}
          </div>

          {localDraft.items.length === 0 ? <p className="cell-value-editor-caption">当前列表为空。</p> : null}

          <button
            className="secondary-button"
            onClick={() => {
              const nextDraft = buildDefaultDraft(schema.elementSchema);
              setLocalDraft((current) => current.kind === "list"
                ? {
                    kind: "list",
                    items: [...current.items, nextDraft],
                  }
                : current);
            }}
            type="button"
          >
            新增元素
          </button>
        </div>
      );
    }

    if (schema.kind === "dictionary" && localDraft.kind === "dictionary") {
      return (
        <div className="cell-value-editor-pane">
          <div className="cell-value-editor-entry-list">
            {localDraft.entries.map((entry, index) => (
              <section className="cell-value-editor-entry" key={`entry-${index}`}>
                <div className="cell-value-editor-entry-header">
                  <strong>条目 {index + 1}</strong>
                  <span>{formatDraftSummary(schema.keySchema, entry.key)} {"->"} {formatDraftSummary(schema.valueSchema, entry.value)}</span>
                </div>
                <div className="cell-value-editor-entry-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      openChildDialogForDraft(schema.keySchema, entry.key, `${subtitle}[${index}].key`, (nextDraft) => {
                        setLocalDraft((current) => current.kind === "dictionary"
                          ? {
                              kind: "dictionary",
                              entries: current.entries.map((currentEntry, entryIndex) => entryIndex === index
                                ? { ...currentEntry, key: nextDraft }
                                : currentEntry),
                            }
                          : current);
                      });
                    }}
                    type="button"
                  >
                    编辑 Key
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      openChildDialogForDraft(schema.valueSchema, entry.value, `${subtitle}[${index}].value`, (nextDraft) => {
                        setLocalDraft((current) => current.kind === "dictionary"
                          ? {
                              kind: "dictionary",
                              entries: current.entries.map((currentEntry, entryIndex) => entryIndex === index
                                ? { ...currentEntry, value: nextDraft }
                                : currentEntry),
                            }
                          : current);
                      });
                    }}
                    type="button"
                  >
                    编辑 Value
                  </button>
                  <button
                    className="secondary-button"
                    disabled={index === 0}
                    onClick={() => {
                      setLocalDraft((current) => {
                        if (current.kind !== "dictionary" || index === 0) {
                          return current;
                        }

                        const entries = [...current.entries];
                        [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
                        return {
                          kind: "dictionary",
                          entries,
                        };
                      });
                    }}
                    type="button"
                  >
                    上移
                  </button>
                  <button
                    className="secondary-button"
                    disabled={index >= localDraft.entries.length - 1}
                    onClick={() => {
                      setLocalDraft((current) => {
                        if (current.kind !== "dictionary" || index >= current.entries.length - 1) {
                          return current;
                        }

                        const entries = [...current.entries];
                        [entries[index], entries[index + 1]] = [entries[index + 1], entries[index]];
                        return {
                          kind: "dictionary",
                          entries,
                        };
                      });
                    }}
                    type="button"
                  >
                    下移
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setLocalDraft((current) => current.kind === "dictionary"
                        ? {
                            kind: "dictionary",
                            entries: current.entries.filter((_, entryIndex) => entryIndex !== index),
                          }
                        : current);
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </section>
            ))}
          </div>

          {localDraft.entries.length === 0 ? <p className="cell-value-editor-caption">当前字典为空。</p> : null}

          <button
            className="secondary-button"
            onClick={() => {
              setLocalDraft((current) => current.kind === "dictionary"
                ? {
                    kind: "dictionary",
                    entries: [
                      ...current.entries,
                      {
                        key: buildDefaultDraft(schema.keySchema),
                        value: buildDefaultDraft(schema.valueSchema),
                      },
                    ],
                  }
                : current);
            }}
            type="button"
          >
            新增条目
          </button>
        </div>
      );
    }

    return <p className="column-editor-error">当前类型暂不支持结构化编辑。</p>;
  }

  return (
    <>
      <DialogBackdrop className={`workspace-create-backdrop${nestedDepth > 0 ? " workspace-create-backdrop--nested" : ""}`} onClose={onClose}>
        <div
          aria-label={title}
          aria-modal="true"
          className={`workspace-create-dialog cell-value-editor-dialog${nestedDepth > 0 ? " cell-value-editor-dialog--nested" : ""}`}
          role="dialog"
        >
          <div className="workspace-create-header">
            <div>
              <p className="eyebrow">{title}</p>
              <strong>{subtitle}</strong>
            </div>
          </div>

          <div className="workspace-create-body cell-value-editor-body">
            <div className="column-editor-summary cell-value-editor-summary">
              <span>类型: {schema.rawType}</span>
              <span>摘要: {summaryText}</span>
              <span>视角: {viewMode === "structured" ? "结构化" : "JSON"}</span>
            </div>

            {warning ? <p className="column-editor-error">{warning}</p> : null}
            {validationMessage ? <p className="column-editor-error">{validationMessage}</p> : null}

            {supportsJsonView ? (
              <div className="cell-value-editor-mode-tabs">
                {schema.kind !== "object" ? (
                  <button
                    className={`secondary-button${viewMode === "structured" ? " is-active" : ""}`}
                    onClick={() => setViewMode("structured")}
                    type="button"
                  >
                    结构化视角
                  </button>
                ) : null}
                <button
                  className={`secondary-button${viewMode === "json" ? " is-active" : ""}`}
                  onClick={() => {
                    const serialized = schema.kind === "object"
                      ? localDraft.kind === "object"
                        ? { ok: true as const, text: localDraft.jsonText }
                        : { ok: true as const, text: buildFallbackJsonText(schema) }
                      : serializeDraftToJsonFragment(schema, localDraft, "$");

                    if (serialized.ok) {
                      setJsonText(serialized.text);
                    }

                    setViewMode("json");
                  }}
                  type="button"
                >
                  JSON 视角
                </button>
              </div>
            ) : null}

            {viewMode === "json" ? (
              <textarea
                className="dialog-field-input column-editor-textarea cell-value-editor-json-textarea"
                onChange={(event) => setJsonText(event.target.value)}
                rows={12}
                spellCheck={false}
                value={jsonText}
              />
            ) : renderStructuredEditor()}
          </div>

          <div className="workspace-create-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" onClick={handleApply} type="button">
              {isRoot ? "应用到单元格" : "应用到当前节点"}
            </button>
          </div>
        </div>
      </DialogBackdrop>

      {childDialog ? (
        <CompositeDraftDialog
          initialDraft={childDialog.initialDraft}
          initialJsonText={childDialog.initialJsonText}
          isRoot={false}
          nestedDepth={nestedDepth + 1}
          onApplyDraft={(nextDraft) => {
            childDialog.onApply(nextDraft);
            setChildDialog(null);
          }}
          onClose={() => setChildDialog(null)}
          onLoadReferenceSheet={onLoadReferenceSheet}
          schema={childDialog.schema}
          subtitle={childDialog.subtitle}
          title={childDialog.title}
          warning={childDialog.warning}
        />
      ) : null}
    </>
  );
}

export function CellValueEditorDialog({
  cellAddress,
  column,
  initialValue,
  isOpen,
  onApply,
  onClose,
  onLoadReferenceSheet,
  onResolveType,
}: CellValueEditorDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialDialogState, setInitialDialogState] = useState<DraftInitializationResult | null>(null);
  const [normalizedType, setNormalizedType] = useState<string>("");
  const [resolvedSchema, setResolvedSchema] = useState<CompositeValueSchema | null>(null);
  const [resolveState, setResolveState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const referenceSheetCacheRef = useRef(new Map<string, Promise<SheetResponse> | SheetResponse>());

  const loadReferenceSheet = useCallback(async (workbookName: string, sheetName: string) => {
    const cacheKey = `${workbookName}::${sheetName}`;
    const cached = referenceSheetCacheRef.current.get(cacheKey);
    if (cached instanceof Promise) {
      return cached;
    }

    if (cached) {
      return cached;
    }

    const pending = onLoadReferenceSheet(workbookName, sheetName)
      .then((sheet) => {
        referenceSheetCacheRef.current.set(cacheKey, sheet);
        return sheet;
      })
      .catch((error) => {
        referenceSheetCacheRef.current.delete(cacheKey);
        throw error;
      });

    referenceSheetCacheRef.current.set(cacheKey, pending);
    return pending;
  }, [onLoadReferenceSheet]);

  useEffect(() => {
    if (!isOpen || !column) {
      setResolveState("idle");
      setResolvedSchema(null);
      setInitialDialogState(null);
      setErrorMessage(null);
      setNormalizedType("");
      referenceSheetCacheRef.current.clear();
      return;
    }

    let cancelled = false;
    setResolveState("loading");
    setResolvedSchema(null);
    setInitialDialogState(null);
    setErrorMessage(null);
    setNormalizedType(column.type);

    void onResolveType(column.type)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.descriptor) {
          setResolveState("error");
          setErrorMessage(result.message ?? "无法解析当前列类型。");
          return;
        }

        const schema = buildSchemaFromDescriptor(result.descriptor);
        const nextInitialState = buildInitialDraftState(schema, initialValue);
        setResolvedSchema(schema);
        setInitialDialogState(nextInitialState);
        setNormalizedType(result.normalizedType ?? column.type);
        setResolveState("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setResolveState("error");
        setErrorMessage(error instanceof Error ? error.message : "解析当前列类型失败。");
      });

    return () => {
      cancelled = true;
    };
  }, [column, initialValue, isOpen, onResolveType]);

  if (!isOpen || !column) {
    return null;
  }

  if (resolveState === "loading") {
    return (
      <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
        <div aria-label="加载值编辑器" aria-modal="true" className="workspace-create-dialog cell-value-editor-dialog" role="dialog">
          <div className="workspace-create-header">
            <div>
              <p className="eyebrow">正在准备值编辑器</p>
              <strong>{cellAddress} · {column.displayName || column.fieldName}</strong>
            </div>
          </div>
          <div className="workspace-create-body cell-value-editor-body">
            <p className="cell-value-editor-caption">正在解析列类型 {column.type}...</p>
          </div>
          <div className="workspace-create-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              关闭
            </button>
          </div>
        </div>
      </DialogBackdrop>
    );
  }

  if (resolveState === "error" || !resolvedSchema || !initialDialogState) {
    return (
      <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
        <div aria-label="值编辑器不可用" aria-modal="true" className="workspace-create-dialog cell-value-editor-dialog" role="dialog">
          <div className="workspace-create-header">
            <div>
              <p className="eyebrow">值编辑器不可用</p>
              <strong>{cellAddress} · {column.displayName || column.fieldName}</strong>
            </div>
          </div>
          <div className="workspace-create-body cell-value-editor-body">
            <p className="column-editor-error">{errorMessage ?? "无法为当前单元格构建值编辑器。"}</p>
            <p className="cell-value-editor-caption">当前列类型: {column.type}</p>
          </div>
          <div className="workspace-create-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              关闭
            </button>
          </div>
        </div>
      </DialogBackdrop>
    );
  }

  return (
    <CompositeDraftDialog
      initialDraft={initialDialogState.draft}
      initialJsonText={initialDialogState.initialJsonText}
      isRoot
      nestedDepth={0}
      onApplyDraft={(nextDraft) => {
        const result = serializeRootDraftToCellValue(resolvedSchema, nextDraft);
        if (result.ok) {
          onApply(result.text);
          return;
        }

          setErrorMessage(result.error);
          return;
      }}
      onClose={onClose}
      onLoadReferenceSheet={loadReferenceSheet}
      schema={resolvedSchema}
      subtitle={`${cellAddress} · ${column.displayName || column.fieldName} · ${normalizedType}`}
      title={`${getSchemaEditorTitle(resolvedSchema)} / ${cellAddress}`}
      warning={errorMessage ?? initialDialogState.warning}
    />
  );
}