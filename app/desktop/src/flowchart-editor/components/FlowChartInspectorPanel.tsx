import { useCallback, useState } from "react";

import type {
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
} from "../types/flowchartEditor";
import { findNodePropertyValue, formatFlowChartTypeRef } from "../utils/flowchartDocument";

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

function formatEditorValue(value: unknown) {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseEditorValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

type FlowChartPropertyInputProps = {
  nodeId: number;
  property: FlowChartNodeDefinitionDocument["properties"][number];
  draftValue: string;
  multiline: boolean;
  onDraftChange: (value: string) => void;
  onReset: () => void;
};

function isBooleanType(rawType: string): boolean {
  return /^bool(ean)?$/i.test(rawType.trim());
}

function isNumericType(rawType: string): boolean {
  return /^(int(eger)?|long|float|double|decimal|number)$/i.test(rawType.trim());
}

function FlowChartPropertyInput({ nodeId, property, draftValue, multiline, onDraftChange, onReset }: FlowChartPropertyInputProps) {
  const formattedType = formatFlowChartTypeRef(property.type);
  const isBoolean = isBooleanType(formattedType);
  const isNumeric = isNumericType(formattedType);

  return (
    <label className="flowchart-inspector-field">
      <span>{property.alias ?? property.name}</span>

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
          type="number"
          value={draftValue === "" ? "" : draftValue}
        />
      ) : multiline ? (
        <textarea
          className="dialog-field-textarea flowchart-inspector-textarea"
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
          value={draftValue}
        />
      ) : (
        <input
          className="dialog-field-input"
          onChange={(event) => onDraftChange(event.target.value)}
          type="text"
          value={draftValue}
        />
      )}

      <div className="flowchart-inspector-field-meta">
        <span>{formatFlowChartTypeRef(property.type)}</span>
        <span>默认值 {formatEditorValue(property.defaultValue)}</span>
      </div>
      <button className="secondary-button flowchart-inspector-reset-button" onClick={onReset} type="button">
        恢复默认
      </button>
    </label>
  );
}

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
  // Derive single-selection state from the nodes array
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedNodeDefinition = selectedNode
    ? selectedNodeDefinitions[selectedNode.nodeType] ?? null
    : null;

  // Lifted draft state: propertyId → raw string value from user edits
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});

  const handleCommitAll = useCallback(() => {
    if (!selectedNode || !selectedNodeDefinition) {
      return;
    }

    const newDrafts: Record<number, string> = {};
    for (const prop of selectedNodeDefinition.properties) {
      const committedValue = findNodePropertyValue(selectedNode, prop.propertyId) ?? prop.defaultValue;
      const currentDraft = draftValues[prop.propertyId] ?? formatEditorValue(committedValue);
      const parsed = parseEditorValue(currentDraft);
      onBatchUpdateNodePropertyValue([selectedNode.nodeId], prop.propertyId, parsed);
      newDrafts[prop.propertyId] = formatEditorValue(parsed);
    }
    setDraftValues(newDrafts);
  }, [selectedNode, selectedNodeDefinition, draftValues, onBatchUpdateNodePropertyValue]);

  const handleDraftChange = useCallback((propertyId: number, value: string) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: value }));
  }, []);

  const handleReset = useCallback((propertyId: number, defaultValue: unknown) => {
    setDraftValues((prev) => ({ ...prev, [propertyId]: formatEditorValue(defaultValue) }));
  }, []);

  if (!activeDocument) {
    return (
      <aside className="flowchart-inspector flowchart-header-selection-stack">
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点与连线</p>
              <strong>暂无活动流程图</strong>
            </div>
          </div>
          <p className="status-detail">打开流程图后，这里会显示当前选中节点或连线的属性与操作。</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="flowchart-inspector flowchart-header-selection-stack">
      {selectedNodeCount === 0 ? (
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点与连线</p>
              <strong>未选择对象</strong>
            </div>
          </div>
          <p className="status-detail">选择节点或连线后，这里会显示对应信息、删除操作以及节点属性编辑器。</p>
        </section>
      ) : null}

      {selectedNodeCount > 1 ? (
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">多选</p>
              <strong>已选择 {selectedNodeCount} 个节点</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelection} type="button">
              删除选择
            </button>
          </div>
          <p className="status-detail">当前支持批量移动、复制、剪切、粘贴和删除。属性编辑仍保持单节点模式。</p>
        </section>
      ) : null}

      {selectedNode ? (
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">节点</p>
              <strong>{selectedNodeDefinition?.alias ?? selectedNodeDefinition?.name ?? selectedNode.nodeType}</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelectedNode} type="button">
              删除节点
            </button>
          </div>

          <div className="flowchart-inspector-field-meta flowchart-inspector-summary-row">
            <span>nodeId {selectedNode.nodeId}</span>
            <span>{selectedNode.nodeType}</span>
          </div>

          {selectedNodeDefinition ? (
            selectedNodeDefinition.properties.length > 0 ? (
              <div className="flowchart-inspector-field-group">
                {selectedNodeDefinition.properties.map((property) => {
                  const committedValue = findNodePropertyValue(selectedNode, property.propertyId) ?? property.defaultValue;
                  const draftValue = draftValues[property.propertyId] ?? formatEditorValue(committedValue);
                  const multiline = typeof committedValue === "object" && committedValue !== null;

                  return (
                    <FlowChartPropertyInput
                      key={property.propertyId}
                      nodeId={selectedNode.nodeId}
                      property={property}
                      draftValue={draftValue}
                      multiline={multiline}
                      onDraftChange={(val) => handleDraftChange(property.propertyId, val)}
                      onReset={() => handleReset(property.propertyId, property.defaultValue)}
                    />
                  );
                })}
                <div className="flowchart-inspector-actions">
                  <button className="primary-button" onClick={handleCommitAll} type="button">
                    确定
                  </button>
                </div>
              </div>
            ) : (
              <p className="status-detail">当前节点没有可编辑属性。</p>
            )
          ) : (
            <p className="status-detail">当前节点定义尚未加载，暂时无法编辑属性。</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}
