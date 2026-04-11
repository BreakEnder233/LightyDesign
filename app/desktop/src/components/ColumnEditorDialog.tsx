import { useEffect, useMemo, useState } from "react";

import { DialogBackdrop } from "./DialogBackdrop";

import {
  applyHeaderPropertyInputValue,
  getHeaderPropertyEditorKind,
  getHeaderPropertyInputValue,
  type HeaderPropertySchema,
  type SheetColumn,
} from "../types/desktopApp";

type ColumnEditorDialogProps = {
  column: SheetColumn | null;
  columnIndex: number | null;
  isOpen: boolean;
  propertySchemas: HeaderPropertySchema[];
  onClose: () => void;
  onSave: (columnIndex: number, nextColumn: SheetColumn) => void;
  onValidateType: (type: string) => Promise<{ ok: boolean; message?: string; normalizedType?: string }>;
};

export function ColumnEditorDialog({
  column,
  columnIndex,
  isOpen,
  propertySchemas,
  onClose,
  onSave,
  onValidateType,
}: ColumnEditorDialogProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [typeValidationState, setTypeValidationState] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [typeValidationMessage, setTypeValidationMessage] = useState<string | null>(null);
  const [typeValidationTarget, setTypeValidationTarget] = useState<string | null>(null);

  const dialogTitle = useMemo(() => {
    if (!column) {
      return "编辑列";
    }

    return `编辑列: ${column.displayName || column.fieldName}`;
  }, [column]);

  useEffect(() => {
    if (!isOpen || !column) {
      return;
    }

    setDraftValues(
      Object.fromEntries(
        propertySchemas.map((schema) => [schema.headerType, getHeaderPropertyInputValue(column, schema)]),
      ),
    );
    setErrorMessage(null);
    setTypeValidationState("idle");
    setTypeValidationMessage(null);
    setTypeValidationTarget(null);
  }, [column, isOpen, propertySchemas]);

  const typeSchema = useMemo(
    () => propertySchemas.find((schema) => schema.bindingSource === "field" && schema.bindingKey === "type") ?? null,
    [propertySchemas],
  );

  useEffect(() => {
    if (!isOpen || !typeSchema || typeValidationTarget === null) {
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
      void onValidateType(candidateType)
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
  }, [isOpen, onValidateType, typeSchema, typeValidationTarget]);

  function updateDraftValue(headerType: string, nextValue: string) {
    setDraftValues((current) => ({
      ...current,
      [headerType]: nextValue,
    }));
    setErrorMessage(null);

    if (typeSchema?.headerType !== headerType) {
      return;
    }

    setTypeValidationTarget(nextValue);
  }

  if (!isOpen || !column || columnIndex === null) {
    return null;
  }

  function handleSubmit() {
    try {
      if (typeSchema && typeValidationTarget !== null && typeValidationState !== "valid") {
        setErrorMessage(typeValidationMessage ?? "请先修正 Type。");
        return;
      }

      let nextColumn = {
        ...column,
        attributes: { ...column.attributes },
      };

      propertySchemas.forEach((schema) => {
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
          <span className="badge">{propertySchemas.length} 个字段</span>
        </div>

        <div className="workspace-create-body column-editor-body">
          <div className="column-editor-summary">
            <span>字段名: {column.fieldName}</span>
            <span>类型: {column.type}</span>
          </div>

          <div className="column-editor-grid">
            {propertySchemas.map((schema) => {
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
                      className="virtual-cell-input virtual-cell-select"
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
                    <input
                      className="virtual-cell-input"
                      onChange={(event) => {
                        updateDraftValue(schema.headerType, event.target.value);
                      }}
                      placeholder={schema.placeholder ?? undefined}
                      type="text"
                      value={currentValue}
                    />
                  ) : null}

                  {editorKind === "json" ? (
                    <textarea
                      className="virtual-cell-input column-editor-textarea"
                      onChange={(event) => {
                        updateDraftValue(schema.headerType, event.target.value);
                      }}
                      placeholder={schema.placeholder ?? undefined}
                      rows={5}
                      value={currentValue}
                    />
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
      </div>
    </DialogBackdrop>
  );
}
