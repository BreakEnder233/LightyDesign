import type { FlowChartNodeDefinitionDocument } from "../types/flowchartEditor";
import type { FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";

type NodePreviewPanelProps = {
  summary: FlowChartNodeDefinitionSummary | null;
  document: FlowChartNodeDefinitionDocument | null;
};

function getTypeLabel(typeRef: unknown): string {
  if (typeof typeRef === "object" && typeRef !== null && "kind" in typeRef) {
    const r = typeRef as Record<string, unknown>;
    if (r.kind === "builtin") return String(r.name ?? "");
    if (r.kind === "custom") return String((r.fullName as string) ?? r.name ?? "");
    if (r.kind === "list") return "List<…>";
    if (r.kind === "dictionary") return "Dict<…>";
    return String(r.kind);
  }
  return "unknown";
}

export function NodePreviewPanel({ summary, document }: NodePreviewPanelProps) {
  if (!summary) {
    return (
      <div className="node-preview-panel is-empty">
        <p className="status-detail">请选择一个节点定义</p>
      </div>
    );
  }

  const doc = document;
  const inputPorts = doc?.flowPorts.filter((p) => p.direction === "input") ?? [];
  const outputPorts = doc?.flowPorts.filter((p) => p.direction === "output") ?? [];
  const inputComputePorts = doc?.computePorts.filter((p) => p.direction === "input") ?? [];
  const outputComputePorts = doc?.computePorts.filter((p) => p.direction === "output") ?? [];

  return (
    <div className="node-preview-panel">
      <div className="node-preview-header">
        <div className="node-preview-title-row">
          <strong>{summary.name}</strong>
          {summary.alias ? <span className="node-preview-alias">{summary.alias}</span> : null}
          <span className={`flowchart-kind-badge is-${summary.nodeKind}`}>{summary.nodeKind}</span>
        </div>
        <div className="node-preview-path">{summary.relativePath}</div>
      </div>

      {summary.description ? (
        <div className="node-preview-section">
          <div className="node-preview-section-title">概述</div>
          <p className="node-preview-description">{summary.description}</p>
        </div>
      ) : null}

      {doc ? (
        <>
          {(inputPorts.length > 0 || outputPorts.length > 0 || inputComputePorts.length > 0 || outputComputePorts.length > 0) ? (
            <div className="node-preview-section">
              <div className="node-preview-section-title">端口</div>
              {inputPorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">input</span>
                  {inputPorts.map((p) => (
                    <div className="node-preview-field" key={`flow-in-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">flow</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {outputPorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">output</span>
                  {outputPorts.map((p) => (
                    <div className="node-preview-field" key={`flow-out-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">flow</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {inputComputePorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">compute input</span>
                  {inputComputePorts.map((p) => (
                    <div className="node-preview-field" key={`comp-in-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">{getTypeLabel(p.type)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {outputComputePorts.length > 0 ? (
                <div className="node-preview-subsection">
                  <span className="node-preview-subsection-label">compute output</span>
                  {outputComputePorts.map((p) => (
                    <div className="node-preview-field" key={`comp-out-${p.portId}`}>
                      <span className="node-preview-field-name">{p.alias ?? p.name}</span>
                      <span className="node-preview-field-type">{getTypeLabel(p.type)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {doc.properties.length > 0 ? (
            <div className="node-preview-section">
              <div className="node-preview-section-title">属性</div>
              {doc.properties.map((prop) => (
                <div className="node-preview-field" key={prop.propertyId}>
                  <span className="node-preview-field-name">{prop.alias ?? prop.name}</span>
                  <span className="node-preview-field-type">{getTypeLabel(prop.type)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="status-detail" style={{ padding: "8px 0" }}>加载节点详情中…</p>
      )}
    </div>
  );
}
