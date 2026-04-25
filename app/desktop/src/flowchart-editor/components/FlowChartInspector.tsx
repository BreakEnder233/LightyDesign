import { useEffect, useState } from "react";

import type {
  FlowChartConnection,
  FlowChartFileDocument,
  FlowChartNodeDefinitionDocument,
  FlowChartNodeInstance,
} from "../types/flowchartEditor";
import { buildFlowChartConnectionKey, findNodePropertyValue, formatFlowChartTypeRef } from "../utils/flowchartDocument";

type FlowChartInspectorProps = {
  activeDocument: FlowChartFileDocument | null;
  selectedNode: FlowChartNodeInstance | null;
  selectedNodeCount: number;
  selectedNodeDefinition: FlowChartNodeDefinitionDocument | null;
  selectedConnection: {
    kind: "flow" | "compute";
    connection: FlowChartConnection;
  } | null;
  selectedConnectionCount: number;
  onDeleteSelection: () => void;
  onDeleteSelectedNode: () => void;
  onDeleteSelectedConnection: () => void;
  onUpdateNodePropertyValue: (nodeId: number, propertyId: number, value: unknown) => void;
  onResetNodePropertyValue: (nodeId: number, propertyId: number) => void;
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
  value: unknown;
  onCommit: (nodeId: number, propertyId: number, value: unknown) => void;
  onReset: (nodeId: number, propertyId: number) => void;
};

function FlowChartPropertyInput({ nodeId, property, value, onCommit, onReset }: FlowChartPropertyInputProps) {
  const [draftValue, setDraftValue] = useState(formatEditorValue(value));
  const multiline = typeof value === "object" && value !== null;

  useEffect(() => {
    setDraftValue(formatEditorValue(value));
  }, [value]);

  return (
    <label className="flowchart-inspector-field">
      <span>{property.alias ?? property.name}</span>
      {multiline ? (
        <textarea
          className="dialog-field-textarea flowchart-inspector-textarea"
          onBlur={() => onCommit(nodeId, property.propertyId, parseEditorValue(draftValue))}
          onChange={(event) => setDraftValue(event.target.value)}
          rows={4}
          value={draftValue}
        />
      ) : (
        <input
          className="dialog-field-input"
          onBlur={() => onCommit(nodeId, property.propertyId, parseEditorValue(draftValue))}
          onChange={(event) => setDraftValue(event.target.value)}
          type="text"
          value={draftValue}
        />
      )}
      <div className="flowchart-inspector-field-meta">
        <span>{formatFlowChartTypeRef(property.type)}</span>
        <span>默认值 {formatEditorValue(property.defaultValue)}</span>
      </div>
      <button className="secondary-button flowchart-inspector-reset-button" onClick={() => onReset(nodeId, property.propertyId)} type="button">
        恢复默认
      </button>
    </label>
  );
}

export function FlowChartInspector({
  activeDocument,
  selectedNode,
  selectedNodeCount,
  selectedNodeDefinition,
  selectedConnection,
  selectedConnectionCount,
  onDeleteSelection,
  onDeleteSelectedNode,
  onDeleteSelectedConnection,
  onUpdateNodePropertyValue,
  onResetNodePropertyValue,
}: FlowChartInspectorProps) {
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
      {!selectedNode && !selectedConnection && selectedNodeCount === 0 && selectedConnectionCount === 0 ? (
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
                {selectedNodeDefinition.properties.map((property) => (
                  <FlowChartPropertyInput
                    key={property.propertyId}
                    nodeId={selectedNode.nodeId}
                    onCommit={onUpdateNodePropertyValue}
                    onReset={onResetNodePropertyValue}
                    property={property}
                    value={findNodePropertyValue(selectedNode, property.propertyId) ?? property.defaultValue}
                  />
                ))}
              </div>
            ) : (
              <p className="status-detail">当前节点没有可编辑属性。</p>
            )
          ) : (
            <p className="status-detail">当前节点定义尚未加载，暂时无法编辑属性。</p>
          )}
        </section>
      ) : null}

      {selectedConnectionCount > 1 ? (
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">多选</p>
              <strong>已选择 {selectedConnectionCount} 条连线</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelection} type="button">
              删除选择
            </button>
          </div>
          <p className="status-detail">多条连线会作为一组处理，检查结构后可继续保存。</p>
        </section>
      ) : null}

      {selectedConnection ? (
        <section className="tree-card flowchart-inspector-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">连线</p>
              <strong>{selectedConnection.kind === "flow" ? "流程边" : "计算边"}</strong>
            </div>
            <button className="secondary-button flowchart-danger-button" onClick={onDeleteSelectedConnection} type="button">
              删除连线
            </button>
          </div>
          <p className="status-detail">{buildFlowChartConnectionKey(selectedConnection.connection)}</p>
        </section>
      ) : null}
    </aside>
  );
}