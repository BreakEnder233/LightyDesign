import { useCallback, useMemo, useRef, useState } from "react";

import type {
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
} from "../types/flowchartEditor";
import {
  findNodePropertyValue,
  formatFlowChartTypeRef,
} from "../utils/flowchartDocument";

type FlowChartInspectorPanelProps = {
  activeDocument: FlowChartFileDocument | null;
  selectedNodes: FlowChartNodeInstance[];
  selectedNodeCount: number;
  selectedNodeDefinitions: Record<string, FlowChartNodeDefinitionDocument | undefined>;
  onDeleteSelection: () => void;
  onDeleteSelectedNode: () => void;
  onUpdateNodePropertyValue: (nodeId: number, propertyId: number, value: unknown) => void;
  onBatchUpdateNodePropertyValue: (nodeIds: number[], propertyId: number, value: unknown) => void;
};

type PanelMode = "hidden" | "empty" | "single" | "batch";

function getPanelMode(
  selectedNodes: FlowChartNodeInstance[],
  selectedNodeDefinitions: Record<string, FlowChartNodeDefinitionDocument | undefined>,
): { mode: PanelMode; definition: FlowChartNodeDefinitionDocument | null } {
  if (selectedNodes.length === 0) return { mode: "hidden", definition: null };

  const uniqueTypes = new Set(selectedNodes.map((n) => n.nodeType));
  if (uniqueTypes.size !== 1) return { mode: "empty", definition: null };

  const typeName = uniqueTypes.values().next().value;
  if (!typeName) return { mode: "empty", definition: null };
  const definition = selectedNodeDefinitions[typeName] ?? null;
  if (!definition) return { mode: "empty", definition: null };

  if (selectedNodes.length === 1) return { mode: "single", definition };
  return { mode: "batch", definition };
}

// ── Utility functions ──

function formatEditorValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

function parseEditorValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function isBooleanType(rawType: string): boolean {
  return /^bool(ean)?$/i.test(rawType.trim());
}

function isNumericType(rawType: string): boolean {
  return /^(int(eger)?|long|float|double|decimal|number)$/i.test(rawType.trim());
}

// ── Property Input (single node) ──

type PropertyInputProps = {
  property: FlowChartNodeDefinitionDocument["properties"][number];
  currentValue: unknown;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onReset: () => void;
};

function PropertyInput({ property, currentValue, draftValue, onDraftChange, onReset }: PropertyInputProps) {
  const formattedType = formatFlowChartTypeRef(property.type);
  const isBoolean = isBooleanType(formattedType);
  const isNumeric = isNumericType(formattedType);
  const isDefault = currentValue === property.defaultValue || currentValue === undefined;
  const multiline = typeof currentValue === "object" && currentValue !== null;
  const label = property.alias ?? property.name;
  const defaultLabel = `默认值: ${formatEditorValue(property.defaultValue)}`;

  return (
    <label className="flowchart-inspector-field">
      <span className="flowchart-inspector-field-header">
        <span>{label}</span>
        <span className="flowchart-inspector-field-type">{formattedType}</span>
      </span>
      <span className="flowchart-inspector-field-input-row">
        {isBoolean ? (
          <select
            className="flowchart-boolean-select"
            onChange={(event) => onDraftChange(event.target.value)}
            value={draftValue}
          >
            <option value="">(空)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isNumeric ? (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            type="number"
            value={draftValue === "" ? "" : draftValue}
          />
        ) : multiline ? (
          <textarea
            className="dialog-field-textarea flowchart-inspector-textarea"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            rows={4}
            value={draftValue}
          />
        ) : (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={defaultLabel}
            type="text"
            value={draftValue}
          />
        )}
        <button
          className="flowchart-inspector-reset-icon"
          disabled={isDefault}
          onClick={onReset}
          title="恢复默认"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7a6 6 0 1112 0A6 6 0 011 7z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M4 7h6M7 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </span>
    </label>
  );
}

// ── Batch Property Input ──

type BatchPropertyInputProps = {
  property: FlowChartNodeDefinitionDocument["properties"][number];
  allSame: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onReset: () => void;
};

function BatchPropertyInput({ property, allSame, draftValue, onDraftChange, onReset }: BatchPropertyInputProps) {
  const formattedType = formatFlowChartTypeRef(property.type);
  const isBoolean = isBooleanType(formattedType);
  const isNumeric = isNumericType(formattedType);
  const label = property.alias ?? property.name;
  const placeholder = allSame ? `默认值: ${formatEditorValue(property.defaultValue)}` : "(多个值)";

  return (
    <label className={`flowchart-inspector-field${!allSame ? " is-mixed" : ""}`}>
      <span className="flowchart-inspector-field-header">
        <span>{label}</span>
        <span className="flowchart-inspector-field-type">{formattedType}</span>
      </span>
      <span className="flowchart-inspector-field-input-row">
        {isBoolean ? (
          <select
            className="flowchart-boolean-select"
            onChange={(event) => onDraftChange(event.target.value)}
            value={draftValue}
          >
            <option value="">(空)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isNumeric ? (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            type="number"
            value={draftValue === "" ? "" : draftValue}
          />
        ) : (
          <input
            className="dialog-field-input"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={draftValue}
          />
        )}
        <button
          className="flowchart-inspector-reset-icon"
          disabled={false}
          onClick={onReset}
          title="恢复默认"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7a6 6 0 1112 0A6 6 0 011 7z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M4 7h6M7 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </span>
    </label>
  );
}

// ── Main Component ──

export function FlowChartInspectorPanel({
  activeDocument,
  selectedNodes,
  selectedNodeCount,
  selectedNodeDefinitions,
  onDeleteSelection,
  onDeleteSelectedNode,
  onUpdateNodePropertyValue,
  onBatchUpdateNodePropertyValue,
}: FlowChartInspectorPanelProps) {
  const { mode, definition } = useMemo(
    () => getPanelMode(selectedNodes, selectedNodeDefinitions),
    [selectedNodes, selectedNodeDefinitions],
  );

  // Draft state: propertyId → raw string
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});
  const selectionKey = useMemo(
    () => selectedNodes.map((n) => n.nodeId).sort().join(","),
    [selectedNodes],
  );

  // Reset drafts when selection changes
  const prevSelectionKeyRef = useRef(selectionKey);
  if (prevSelectionKeyRef.current !== selectionKey) {
    prevSelectionKeyRef.current = selectionKey;
    setDraftValues({});
  }

  const handleDraftChange = useCallback((propertyId: number, value: string) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: value }));
  }, []);

  const handleReset = useCallback((propertyId: number, defaultValue: unknown) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: formatEditorValue(defaultValue) }));
  }, []);

  const handleCommit = useCallback(() => {
    if (!definition) return;

    if (mode === "single" && selectedNodes[0]) {
      const node = selectedNodes[0];
      for (const prop of definition.properties) {
        const draft = draftValues[prop.propertyId];
        if (draft !== undefined) {
          const parsed = parseEditorValue(draft);
          onUpdateNodePropertyValue(node.nodeId, prop.propertyId, parsed);
        }
      }
      setDraftValues({});
    }

    if (mode === "batch") {
      const nodeIds = selectedNodes.map((n) => n.nodeId);
      for (const prop of definition.properties) {
        const draft = draftValues[prop.propertyId];
        if (draft !== undefined) {
          const parsed = parseEditorValue(draft);
          onBatchUpdateNodePropertyValue(nodeIds, prop.propertyId, parsed);
        }
        // If no draft, skip — each node keeps its original value
      }
      setDraftValues({});
    }
  }, [definition, mode, selectedNodes, draftValues, onUpdateNodePropertyValue, onBatchUpdateNodePropertyValue]);

  // ── Render: hidden mode ──
  if (mode === "hidden" || !activeDocument) {
    return null;
  }

  // ── Render: empty mode ──
  if (mode === "empty") {
    return (
      <aside className="flowchart-inspector-panel">
        <section className="tree-card flowchart-inspector-panel-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点与连线</p>
              <strong>无法批量编辑</strong>
            </div>
          </div>
          <p className="status-detail">选中的节点类型不一致。批量编辑仅支持同类节点。</p>
        </section>
      </aside>
    );
  }

  // ── Render: single mode ──
  if (mode === "single" && definition) {
    const node = selectedNodes[0];
    return (
      <aside className="flowchart-inspector-panel">
        <div className="flowchart-inspector-panel-header">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点属性</p>
              <strong>{definition.alias ?? definition.name}</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelectedNode} type="button">
              删除
            </button>
          </div>
        </div>

        <div className="flowchart-inspector-panel-body">
          {definition.properties.length === 0 ? (
            <p className="status-detail">当前节点没有可编辑属性。</p>
          ) : (
            <div className="flowchart-inspector-field-group">
              {definition.properties.map((prop) => {
                const committedValue = findNodePropertyValue(node, prop.propertyId) ?? prop.defaultValue;
                const draftValue = draftValues[prop.propertyId] ?? formatEditorValue(committedValue);
                return (
                  <PropertyInput
                    key={prop.propertyId}
                    property={prop}
                    currentValue={committedValue}
                    draftValue={draftValue}
                    onDraftChange={(val) => handleDraftChange(prop.propertyId, val)}
                    onReset={() => handleReset(prop.propertyId, prop.defaultValue)}
                  />
                );
              })}
              <div className="flowchart-inspector-actions">
                <button className="primary-button" onClick={handleCommit} type="button">
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // ── Render: batch mode ──
  if (mode === "batch" && definition) {
    const typeName = definition.alias ?? definition.name;
    return (
      <aside className="flowchart-inspector-panel">
        <div className="flowchart-inspector-panel-header">
          <div className="section-header">
            <div>
              <p className="eyebrow">批量编辑</p>
              <strong>{selectedNodeCount}个节点（{typeName}）</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelection} type="button">
              删除
            </button>
          </div>
          <p className="status-detail">未修改的字段将保持各节点原值。</p>
        </div>

        <div className="flowchart-inspector-panel-body">
          {definition.properties.length === 0 ? (
            <p className="status-detail">当前节点没有可编辑属性。</p>
          ) : (
            <div className="flowchart-inspector-field-group">
              {definition.properties.map((prop) => {
                const values = selectedNodes.map(
                  (n) => findNodePropertyValue(n, prop.propertyId) ?? prop.defaultValue,
                );
                const allSame = values.every((v) => formatEditorValue(v) === formatEditorValue(values[0]));
                const displayValue = allSame ? formatEditorValue(values[0]) : "";
                const draftValue = draftValues[prop.propertyId] ?? displayValue;

                return (
                  <BatchPropertyInput
                    key={prop.propertyId}
                    property={prop}
                    allSame={allSame}
                    draftValue={draftValue}
                    onDraftChange={(val) => handleDraftChange(prop.propertyId, val)}
                    onReset={() => handleReset(prop.propertyId, prop.defaultValue)}
                  />
                );
              })}
              <div className="flowchart-inspector-actions">
                <button className="primary-button" onClick={handleCommit} type="button">
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  return null;
}
