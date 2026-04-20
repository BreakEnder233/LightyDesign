import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactElement } from "react";

import { DialogBackdrop } from "./DialogBackdrop";
import { TypeComposerDialog } from "./TypeComposerDialog";

import {
  applyHeaderPropertyInputValue,
  getHeaderPropertyEditorKind,
  getHeaderPropertyInputValue,
  type HeaderPropertySchema,
  type SheetColumn,
  type TypeMetadataResponse,
  type TypeValidationResponse,
  type ValidationRuleSchema,
  type ValidationRuleValidationResponse,
  type ValidationSchemaResolveResponse,
} from "../types/desktopApp";

type ColumnEditorDialogProps = {
  column: SheetColumn | null;
  columnIndex: number | null;
  isOpen: boolean;
  propertySchemas: HeaderPropertySchema[];
  typeMetadata: TypeMetadataResponse | null;
  onClose: () => void;
  onSave: (columnIndex: number, nextColumn: SheetColumn) => void;
  onValidateType: (type: string) => Promise<TypeValidationResponse>;
  onResolveValidationSchema: (type: string) => Promise<ValidationSchemaResolveResponse>;
  onValidateValidationRule: (type: string, validation: unknown) => Promise<ValidationRuleValidationResponse>;
};

export function ColumnEditorDialog({
  column,
  columnIndex,
  isOpen,
  propertySchemas,
  typeMetadata,
  onClose,
  onSave,
  onValidateType,
  onResolveValidationSchema,
  onValidateValidationRule,
}: ColumnEditorDialogProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typeValidationState, setTypeValidationState] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [typeValidationMessage, setTypeValidationMessage] = useState<string | null>(null);
  const [typeValidationTarget, setTypeValidationTarget] = useState<string | null>(null);
  const [validationSchemaState, setValidationSchemaState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [validationSchemaMessage, setValidationSchemaMessage] = useState<string | null>(null);
  const [validationSchema, setValidationSchema] = useState<ValidationRuleSchema | null>(null);
  const [validationRuleState, setValidationRuleState] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [validationRuleMessage, setValidationRuleMessage] = useState<string | null>(null);
  const [isTypeComposerOpen, setIsTypeComposerOpen] = useState(false);
  const [sessionPropertySchemas, setSessionPropertySchemas] = useState<HeaderPropertySchema[]>([]);
  const [sessionTypeMetadata, setSessionTypeMetadata] = useState<TypeMetadataResponse | null>(null);
  const initializedColumnSessionRef = useRef<string | null>(null);
  const validateType = useEffectEvent(onValidateType);
  const resolveValidationSchema = useEffectEvent(onResolveValidationSchema);
  const validateValidationRule = useEffectEvent(onValidateValidationRule);

  const dialogTitle = useMemo(() => {
    if (!column) {
      return "编辑列";
    }

    return `编辑列: ${column.displayName || column.fieldName}`;
  }, [column]);

  const typeSchema = useMemo(
    () => sessionPropertySchemas.find((schema) => schema.bindingSource === "field" && schema.bindingKey === "type") ?? null,
    [sessionPropertySchemas],
  );

  const validationPropertySchema = useMemo(
    () => sessionPropertySchemas.find((schema) => schema.bindingSource === "attribute" && schema.bindingKey === "Validation") ?? null,
    [sessionPropertySchemas],
  );
  const typeSchemaHeaderType = typeSchema?.headerType ?? null;
  const validationPropertyHeaderType = validationPropertySchema?.headerType ?? null;

  const columnSessionKey = useMemo(() => {
    if (!column || columnIndex === null) {
      return null;
    }

    return `${columnIndex}:${column.fieldName}`;
  }, [column, columnIndex]);

  useEffect(() => {
    if (!isOpen || !column || columnIndex === null || !columnSessionKey) {
      initializedColumnSessionRef.current = null;
      return;
    }

    if (initializedColumnSessionRef.current === columnSessionKey) {
      return;
    }

    initializedColumnSessionRef.current = columnSessionKey;
    setSessionPropertySchemas(propertySchemas);
    setSessionTypeMetadata(typeMetadata);

    setDraftValues(
      Object.fromEntries(
        propertySchemas.map((schema) => [schema.headerType, getHeaderPropertyInputValue(column, schema)]),
      ),
    );
    setErrorMessage(null);
    setTypeValidationState("idle");
    setTypeValidationMessage(null);
    setTypeValidationTarget(column.type);
    setValidationSchemaState("idle");
    setValidationSchemaMessage(null);
    setValidationSchema(null);
    setValidationRuleState("idle");
    setValidationRuleMessage(null);
    setIsTypeComposerOpen(false);
  }, [column, columnIndex, columnSessionKey, isOpen, propertySchemas, typeMetadata]);

  const currentTypeValue = useMemo(
    () => (typeSchemaHeaderType ? (draftValues[typeSchemaHeaderType] ?? column?.type ?? "") : column?.type ?? ""),
    [column?.type, draftValues, typeSchemaHeaderType],
  );

  const currentValidationText = useMemo(
    () => (validationPropertyHeaderType ? (draftValues[validationPropertyHeaderType] ?? "") : ""),
    [draftValues, validationPropertyHeaderType],
  );

  useEffect(() => {
    if (!isOpen || !typeSchemaHeaderType || typeValidationTarget === null) {
      return;
    }

    const candidateType = typeValidationTarget.trim();
    if (!candidateType) {
      setTypeValidationState("invalid");
      setTypeValidationMessage("Type 不能为空。");
      return;
    }

    setTypeValidationState("validating");
    setTypeValidationMessage("正在校验 Type...");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void validateType(candidateType)
        .then((result) => {
          if (cancelled) {
            return;
          }

          setTypeValidationState(result.ok ? "valid" : "invalid");
          setTypeValidationMessage(result.ok
            ? `Type 有效: ${result.normalizedType ?? candidateType}`
            : (result.message ?? "Type 校验失败。"));
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setTypeValidationState("invalid");
          setTypeValidationMessage(error instanceof Error ? error.message : "Type 校验失败。");
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, typeSchemaHeaderType, typeValidationTarget]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const candidateType = currentTypeValue.trim();
    if (!candidateType) {
      setValidationSchemaState("idle");
      setValidationSchemaMessage("请先填写合法 Type，再查看对应的 validation schema。");
      setValidationSchema(null);
      return;
    }

    if (typeValidationState === "invalid") {
      setValidationSchemaState("error");
      setValidationSchemaMessage(typeValidationMessage ?? "请先修正 Type。");
      setValidationSchema(null);
      return;
    }

    if (typeValidationState === "validating") {
      setValidationSchemaState("loading");
      setValidationSchemaMessage("正在根据 Type 加载 validation schema...");
      setValidationSchema(null);
      return;
    }

    setValidationSchemaState("loading");
    setValidationSchemaMessage("正在根据 Type 加载 validation schema...");
    let cancelled = false;

    void resolveValidationSchema(candidateType)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.schema) {
          setValidationSchemaState("error");
          setValidationSchemaMessage(result.message ?? "无法加载 validation schema。");
          setValidationSchema(null);
          return;
        }

        setValidationSchemaState("ready");
        setValidationSchemaMessage(null);
        setValidationSchema(result.schema);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setValidationSchemaState("error");
        setValidationSchemaMessage(error instanceof Error ? error.message : "无法加载 validation schema。");
        setValidationSchema(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTypeValue, isOpen, typeValidationMessage, typeValidationState]);

  useEffect(() => {
    if (!isOpen || !validationPropertyHeaderType) {
      return;
    }

    const candidateType = currentTypeValue.trim();
    if (!candidateType) {
      setValidationRuleState("idle");
      setValidationRuleMessage("请先填写 Type，再校验 validation 规则。");
      return;
    }

    if (typeValidationState !== "valid") {
      setValidationRuleState(typeValidationState === "invalid" ? "invalid" : "idle");
      setValidationRuleMessage(typeValidationMessage ?? "请先完成 Type 校验。");
      return;
    }

    const trimmedValidationText = currentValidationText.trim();
    if (!trimmedValidationText) {
      setValidationRuleState("valid");
      setValidationRuleMessage("当前列未填写 validation，将使用默认规则。");
      return;
    }

    let parsedValidation: unknown;
    try {
      parsedValidation = JSON.parse(trimmedValidationText) as unknown;
    } catch {
      setValidationRuleState("invalid");
      setValidationRuleMessage("校验规则必须是合法 JSON 对象。");
      return;
    }

    if (typeof parsedValidation !== "object" || parsedValidation === null || Array.isArray(parsedValidation)) {
      setValidationRuleState("invalid");
      setValidationRuleMessage("校验规则必须是 JSON 对象。");
      return;
    }

    setValidationRuleState("validating");
    setValidationRuleMessage("正在校验 validation 规则...");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void validateValidationRule(candidateType, parsedValidation)
        .then((result) => {
          if (cancelled) {
            return;
          }

          setValidationRuleState(result.ok ? "valid" : "invalid");
          setValidationRuleMessage(result.ok ? "validation 规则结构有效。" : (result.message ?? "validation 规则校验失败。"));
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setValidationRuleState("invalid");
          setValidationRuleMessage(error instanceof Error ? error.message : "validation 规则校验失败。");
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentTypeValue, currentValidationText, isOpen, typeValidationMessage, typeValidationState, validationPropertyHeaderType]);

  function updateDraftValue(headerType: string, nextValue: string) {
    setDraftValues((current) => ({
      ...current,
      [headerType]: nextValue,
    }));
    setErrorMessage(null);

    if (typeSchemaHeaderType !== headerType) {
      return;
    }

    setTypeValidationTarget(nextValue);
  }

  if (!isOpen || !column || columnIndex === null) {
    return null;
  }

  function buildSchemaExample(schema: ValidationRuleSchema): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    schema.properties
      .filter((property) => !property.deprecated)
      .forEach((property) => {
        if (property.example !== undefined) {
          result[property.name] = property.example;
          return;
        }

        if (property.defaultValue !== undefined) {
          result[property.name] = property.defaultValue;
        }
      });

    schema.nestedSchemas.forEach((nestedSchema) => {
      result[nestedSchema.propertyName] = buildSchemaExample(nestedSchema.schema);
    });

    return result;
  }

  function renderSchemaPanel(schema: ValidationRuleSchema, depth = 0): ReactElement {
    return (
      <div className={`validation-schema-panel${depth > 0 ? " validation-schema-panel--nested" : ""}`}>
        <div className="validation-schema-panel-header">
          <div>
            <p className="validation-schema-panel-title">{schema.typeDisplayName}</p>
            <p className="validation-schema-panel-description">{schema.description}</p>
          </div>

          {depth === 0 && validationPropertyHeaderType ? (
            <button
              className="secondary-button validation-schema-panel-action"
              onClick={() => {
                updateDraftValue(validationPropertyHeaderType, JSON.stringify(buildSchemaExample(schema), null, 2));
              }}
              type="button"
            >
              插入示例
            </button>
          ) : null}
        </div>

        <div className="validation-schema-property-list">
          {schema.properties.map((property) => (
            <div className="validation-schema-property" key={property.name}>
              <div className="validation-schema-property-heading">
                <span className="validation-schema-property-name">{property.name}</span>
                <span className="validation-schema-property-type">{property.valueType}</span>
              </div>
              <p className="validation-schema-property-description">{property.description}</p>
              <div className="validation-schema-property-meta">
                <span>{property.required ? "必填" : "可选"}</span>
                {property.defaultValue !== undefined ? <span>默认值: {JSON.stringify(property.defaultValue)}</span> : null}
                {property.example !== undefined ? <span>示例: {JSON.stringify(property.example)}</span> : null}
                {property.deprecated ? <span>兼容字段</span> : null}
                {property.aliasOf ? <span>别名: {property.aliasOf}</span> : null}
              </div>
            </div>
          ))}
        </div>

        {schema.nestedSchemas.length > 0 ? (
          <div className="validation-schema-nested-list">
            {schema.nestedSchemas.map((nestedSchema) => (
              <div className="validation-schema-nested-item" key={nestedSchema.propertyName}>
                <div className="validation-schema-nested-heading">
                  <span className="validation-schema-property-name">{nestedSchema.propertyName}</span>
                  <span className="badge">{nestedSchema.label}</span>
                </div>
                <p className="validation-schema-property-description">{nestedSchema.description}</p>
                {renderSchemaPanel(nestedSchema.schema, depth + 1)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function handleSubmit() {
    try {
      if (!column || columnIndex === null) {
        return;
      }

      if (typeSchemaHeaderType && typeValidationTarget !== null && typeValidationState !== "valid") {
        setErrorMessage(typeValidationMessage ?? "请先修正 Type。");
        return;
      }

      if (validationPropertyHeaderType && currentValidationText.trim().length > 0 && validationRuleState !== "valid") {
        setErrorMessage(validationRuleMessage ?? "请先修正 validation 规则。");
        return;
      }

      let nextColumn: SheetColumn = {
        ...column,
        attributes: { ...column.attributes },
      };

      sessionPropertySchemas.forEach((schema) => {
        nextColumn = applyHeaderPropertyInputValue(nextColumn, schema, draftValues[schema.headerType] ?? "");
      });

      onSave(columnIndex, nextColumn);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "列属性解析失败。");
    }
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div
        aria-label={dialogTitle}
        aria-modal="true"
        className="workspace-create-dialog column-editor-dialog"
        role="dialog"
      >
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">编辑表头 / {column.displayName || column.fieldName}</p>
          </div>
          <span className="badge">{sessionPropertySchemas.length} 个字段</span>
        </div>

        <div className="workspace-create-body column-editor-body">
          <div className="column-editor-summary">
            <span>字段名: {column.fieldName}</span>
            <span>类型: {column.type}</span>
          </div>

          <div className="column-editor-grid">
            {sessionPropertySchemas.map((schema) => {
              const currentValue = draftValues[schema.headerType] ?? "";
              const editorKind = getHeaderPropertyEditorKind(schema);

              return (
                <label className="search-field column-editor-field" key={schema.headerType}>
                  <span>
                    {schema.label}
                    {schema.required ? " *" : ""}
                  </span>

                  {editorKind === "enum" ? (
                    <select
                      className="dialog-field-select"
                      onChange={(event) => {
                        updateDraftValue(schema.headerType, event.target.value);
                      }}
                      value={currentValue}
                    >
                      {!schema.required ? <option value="">(empty)</option> : null}
                      {schema.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {editorKind === "text" ? (
                    schema.headerType === typeSchemaHeaderType ? (
                      <div className="type-input-row">
                        <input
                          className="dialog-field-input"
                          onChange={(event) => {
                            updateDraftValue(schema.headerType, event.target.value);
                          }}
                          placeholder={schema.placeholder ?? undefined}
                          type="text"
                          value={currentValue}
                        />
                        <button
                          className="secondary-button type-input-helper"
                          disabled={!sessionTypeMetadata}
                          onClick={() => {
                            setIsTypeComposerOpen(true);
                          }}
                          type="button"
                        >
                          快速填写
                        </button>
                      </div>
                    ) : (
                      <input
                        className="dialog-field-input"
                        onChange={(event) => {
                          updateDraftValue(schema.headerType, event.target.value);
                        }}
                        placeholder={schema.placeholder ?? undefined}
                        type="text"
                        value={currentValue}
                      />
                    )
                  ) : null}

                  {editorKind === "json" ? (
                    schema.headerType === validationPropertyHeaderType ? (
                      <div className="validation-editor-layout">
                        <textarea
                          className="dialog-field-textarea column-editor-textarea validation-editor-textarea"
                          onChange={(event) => {
                            updateDraftValue(schema.headerType, event.target.value);
                          }}
                          placeholder={schema.placeholder ?? undefined}
                          rows={10}
                          value={currentValue}
                        />

                        <aside className="validation-editor-sidebar">
                          {validationSchemaState === "ready" && validationSchema ? renderSchemaPanel(validationSchema) : null}
                          {validationSchemaState !== "ready" ? (
                            <p className={`column-editor-validation column-editor-validation--${validationSchemaState === "error" ? "invalid" : "validating"}`}>
                              {validationSchemaMessage ?? "正在加载 validation schema..."}
                            </p>
                          ) : null}
                        </aside>
                      </div>
                    ) : (
                      <textarea
                        className="dialog-field-textarea column-editor-textarea"
                        onChange={(event) => {
                          updateDraftValue(schema.headerType, event.target.value);
                        }}
                        placeholder={schema.placeholder ?? undefined}
                        rows={5}
                        value={currentValue}
                      />
                    )
                  ) : null}
                </label>
              );
            })}
          </div>

          {typeSchema && typeValidationTarget !== null ? (
            <p className={`column-editor-validation column-editor-validation--${typeValidationState}`}>
              {typeValidationMessage ?? "Type 尚未校验。"}
            </p>
          ) : null}

          {validationPropertySchema ? (
            <p className={`column-editor-validation column-editor-validation--${validationRuleState === "invalid" ? "invalid" : validationRuleState === "valid" ? "valid" : "validating"}`}>
              {validationRuleMessage ?? "validation 规则尚未校验。"}
            </p>
          ) : null}

          {errorMessage ? <p className="column-editor-error">{errorMessage}</p> : null}
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" onClick={handleSubmit} type="button">
            应用到当前列
          </button>
        </div>

        <TypeComposerDialog
          currentType={typeSchemaHeaderType ? (draftValues[typeSchemaHeaderType] ?? "") : ""}
          isOpen={isTypeComposerOpen}
          onApply={(nextType) => {
            if (!typeSchemaHeaderType) {
              return;
            }

            updateDraftValue(typeSchemaHeaderType, nextType);
          }}
          onClose={() => {
            setIsTypeComposerOpen(false);
          }}
          onResolveType={onValidateType}
          typeMetadata={sessionTypeMetadata}
        />
      </div>
    </DialogBackdrop>
  );
}
