import { useEffect, useMemo, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";
import type { TypeMetadataResponse } from "../../workbook-editor/types/desktopApp";
import { TypeComposerDialog } from "../../workbook-editor/components/TypeComposerDialog";

import type {
  FlowChartNodeDefinitionDocument,
  FlowChartNodeKind,
  FlowChartPropertyDefinition,
  FlowChartComputePortDefinition,
  FlowChartFlowPortDefinition,
} from "../types/flowchartEditor";
import {
  builderNodeToTypeRef,
  typeRefToBuilderNode,
  getNextPropertyId,
  getNextPortId,
  validateNodeDefinitionStructure,
} from "../utils/flowchartNodeDefinitionSchema";

export type NodeDefinitionDialogMode = "create" | "edit";

export type FlowChartNodeDefinitionDialogProps = {
  isOpen: boolean;
  mode: NodeDefinitionDialogMode;
  /** 创建模式下初始的相对路径（含目录前缀） */
  initialRelativePath: string;
  /** 编辑模式下加载的已有定义 */
  existingDefinition: FlowChartNodeDefinitionDocument | null;
  /** 要编辑的现有相对路径（编辑模式） */
  existingRelativePath: string | null;
  typeMetadata: TypeMetadataResponse | null;
  onClose: () => void;
  onSubmit: (relativePath: string, document: FlowChartNodeDefinitionDocument) => Promise<boolean>;
  onResolveType: (type: string) => Promise<{ ok: boolean; normalizedType?: string; message?: string }>;
};

type DetailEditTarget =
  | { kind: "property"; propertyId: number }
  | { kind: "computePort"; portId: number }
  | { kind: "flowPort"; portId: number }
  | null;

type PortDirection = "input" | "output";

export function FlowChartNodeDefinitionDialog({
  isOpen,
  mode,
  initialRelativePath,
  existingDefinition,
  existingRelativePath,
  typeMetadata,
  onClose,
  onSubmit,
  onResolveType,
}: FlowChartNodeDefinitionDialogProps) {
  // ── 编辑状态 ──
  const [relativePath, setRelativePath] = useState(initialRelativePath);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [nodeKind, setNodeKind] = useState<FlowChartNodeKind>("event");
  const [properties, setProperties] = useState<FlowChartPropertyDefinition[]>([]);
  const [computePorts, setComputePorts] = useState<FlowChartComputePortDefinition[]>([]);
  const [flowPorts, setFlowPorts] = useState<FlowChartFlowPortDefinition[]>([]);
  const [detailTarget, setDetailTarget] = useState<DetailEditTarget>(null);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [typePickerTarget, setTypePickerTarget] = useState<"property" | "computePort" | null>(null);
  const [typePickerPropertyId, setTypePickerPropertyId] = useState<number | null>(null);
  const [typePickerPortId, setTypePickerPortId] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateNodeDefinitionStructure>>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ── 初始化 / 重置 ──
  useEffect(() => {
    if (!isOpen) return;

    if (mode === "edit" && existingDefinition) {
      setRelativePath(existingRelativePath ?? initialRelativePath);
      setName(existingDefinition.name);
      setAlias(existingDefinition.alias ?? "");
      setNodeKind(existingDefinition.nodeKind);
      setProperties([...existingDefinition.properties]);
      setComputePorts([...existingDefinition.computePorts]);
      setFlowPorts([...existingDefinition.flowPorts]);
    } else {
      setRelativePath(initialRelativePath);
      setName(initialRelativePath.split("/").pop() ?? "NewNode");
      setAlias("");
      setNodeKind("event");
      setProperties([]);
      setComputePorts([]);
      setFlowPorts([
        { portId: 1, name: "Enter", direction: "input" },
        { portId: 2, name: "Then", direction: "output" },
      ]);
    }

    setDetailTarget(null);
    setErrors([]);
    setIsSaving(false);
  }, [isOpen, mode, existingDefinition, existingRelativePath, initialRelativePath]);

  // ── 校验 ──
  useEffect(() => {
    const document: FlowChartNodeDefinitionDocument = {
      formatVersion: "1.0",
      name,
      alias: alias || null,
      nodeKind,
      properties,
      computePorts,
      flowPorts,
    };
    setErrors(validateNodeDefinitionStructure(document));
  }, [name, alias, nodeKind, properties, computePorts, flowPorts]);

  // ── 构建当前文档，用于提交 ──
  const currentDocument = useMemo<FlowChartNodeDefinitionDocument>(() => ({
    formatVersion: "1.0",
    name,
    alias: alias || null,
    nodeKind,
    properties,
    computePorts,
    flowPorts,
  }), [name, alias, nodeKind, properties, computePorts, flowPorts]);

  // ── 属性操作 ──
  function addProperty() {
    const nextId = getNextPropertyId(currentDocument);
    setProperties((prev) => [
      ...prev,
      { propertyId: nextId, name: `Property${nextId}`, type: { kind: "builtin", name: "string" }, defaultValue: "" },
    ]);
    setDetailTarget({ kind: "property", propertyId: nextId });
  }

  function updateProperty(propertyId: number, patch: Partial<FlowChartPropertyDefinition>) {
    setProperties((prev) => prev.map((p) => (p.propertyId === propertyId ? { ...p, ...patch } : p)));
  }

  function removeProperty(propertyId: number) {
    setProperties((prev) => prev.filter((p) => p.propertyId !== propertyId));
    setDetailTarget((prev) => {
      if (prev?.kind === "property" && prev.propertyId === propertyId) return null;
      return prev;
    });
  }

  // ── 计算端口操作 ──
  function addComputePort() {
    const nextId = getNextPortId(currentDocument, "compute");
    setComputePorts((prev) => [
      ...prev,
      { portId: nextId, name: `Compute${nextId}`, alias: null, direction: "input", type: { kind: "builtin", name: "int32" } },
    ]);
    setDetailTarget({ kind: "computePort", portId: nextId });
  }

  function updateComputePort(portId: number, patch: Partial<FlowChartComputePortDefinition>) {
    setComputePorts((prev) => prev.map((p) => (p.portId === portId ? { ...p, ...patch } : p)));
  }

  function removeComputePort(portId: number) {
    setComputePorts((prev) => prev.filter((p) => p.portId !== portId));
    setDetailTarget((prev) => {
      if (prev?.kind === "computePort" && prev.portId === portId) return null;
      return prev;
    });
  }

  // ── 流程端口操作 ──
  function addFlowPort() {
    const nextId = getNextPortId(currentDocument, "flow");
    setFlowPorts((prev) => [
      ...prev,
      { portId: nextId, name: `Flow${nextId}`, direction: "input" },
    ]);
    setDetailTarget({ kind: "flowPort", portId: nextId });
  }

  function updateFlowPort(portId: number, patch: Partial<FlowChartFlowPortDefinition>) {
    setFlowPorts((prev) => prev.map((p) => (p.portId === portId ? { ...p, ...patch } : p)));
  }

  function removeFlowPort(portId: number) {
    setFlowPorts((prev) => prev.filter((p) => p.portId !== portId));
    setDetailTarget((prev) => {
      if (prev?.kind === "flowPort" && prev.portId === portId) return null;
      return prev;
    });
  }

  // ── 类型选择器 ──
  function openTypePicker(target: "property" | "computePort", targetId: number) {
    setTypePickerTarget(target);
    if (target === "property") {
      setTypePickerPropertyId(targetId);
      setTypePickerPortId(null);
    } else {
      setTypePickerPortId(targetId);
      setTypePickerPropertyId(null);
    }
    setIsTypePickerOpen(true);
  }

  function handleTypePickerClose() {
    setIsTypePickerOpen(false);
    setTypePickerTarget(null);
    setTypePickerPropertyId(null);
    setTypePickerPortId(null);
  }

  function handleTypePickerApply(node: import("../../workbook-editor/components/TypeComposerDialog").BuilderNode) {
    const typeRef = builderNodeToTypeRef(node);
    if (typePickerTarget === "property" && typePickerPropertyId !== null) {
      updateProperty(typePickerPropertyId, { type: typeRef });
    } else if (typePickerTarget === "computePort" && typePickerPortId !== null) {
      updateComputePort(typePickerPortId, { type: typeRef });
    }
    handleTypePickerClose();
  }

  // ── 提交 ──
  async function handleSubmit() {
    const validationErrors = validateNodeDefinitionStructure(currentDocument);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(relativePath, currentDocument);
    } finally {
      setIsSaving(false);
    }
  }

  // ── 获取详情目标的数据 ──
  const detailData = useMemo(() => {
    if (!detailTarget) return null;
    if (detailTarget.kind === "property") {
      return properties.find((p) => p.propertyId === detailTarget.propertyId) ?? null;
    }
    if (detailTarget.kind === "computePort") {
      return computePorts.find((p) => p.portId === detailTarget.portId) ?? null;
    }
    return flowPorts.find((p) => p.portId === detailTarget.portId) ?? null;
  }, [detailTarget, properties, computePorts, flowPorts]);

  // ── 阻止渲染 ──
  if (!isOpen) return null;

  const hasBlockingErrors = errors.length > 0;

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label="节点定义编辑器" aria-modal="true" className="workspace-create-dialog flowchart-node-dialog" role="dialog">
        {/* ── 顶部 header ── */}
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{mode === "create" ? "新建节点定义" : "编辑节点定义"}</p>
            <strong>{relativePath}</strong>
          </div>
          {hasBlockingErrors ? <span className="badge flowchart-badge-error">{errors.length} 个问题</span> : null}
        </div>

        <div className="workspace-create-body">
          <div className="flowchart-node-dialog-grid">
            {/* ── 左侧：主编辑区 ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflow: "auto" }}>
              {/* 顶层字段 */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>相对路径</span>
                  <input
                    onChange={(e) => setRelativePath(e.target.value)}
                    placeholder="Event/Player/OnEnterScene"
                    type="text"
                    value={relativePath}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>名称 (name) *</span>
                  <input
                    onChange={(e) => setName(e.target.value)}
                    placeholder="OnEnterScene"
                    type="text"
                    value={name}
                  />
                </label>
                <label className="search-field compact-field" style={{ flex: "1 1 160px" }}>
                  <span>别名 (alias)</span>
                  <input
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="进入场景"
                    type="text"
                    value={alias}
                  />
                </label>
                <label className="search-field compact-field" style={{ flex: "0 0 120px" }}>
                  <span>节点种类</span>
                  <select
                    className="dialog-field-select"
                    onChange={(e) => setNodeKind(e.target.value as FlowChartNodeKind)}
                    value={nodeKind}
                  >
                    <option value="event">event</option>
                    <option value="flow">flow</option>
                    <option value="compute">compute</option>
                  </select>
                </label>
              </div>

              {/* 属性表格 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="flowchart-node-section-header" style={{ padding: 0 }}>属性</span>
                  <button className="secondary-button flowchart-library-add-button" onClick={addProperty} type="button">+ 添加属性</button>
                </div>
                {properties.length === 0 ? (
                  <p className="status-detail" style={{ padding: "4px 0" }}>暂无属性定义，点击上方按钮添加。</p>
                ) : (
                  <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 160, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>别名</th>
                          <th style={{ padding: "4px 6px", textAlign: "left" }}>类型</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", width: 80 }}>默认值</th>
                          <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {properties.map((prop) => (
                          <tr
                            key={prop.propertyId}
                            onClick={() => setDetailTarget({ kind: "property", propertyId: prop.propertyId })}
                            style={{
                              cursor: "pointer",
                              borderBottom: "1px solid #2a2a2a",
                              background: detailTarget?.kind === "property" && detailTarget.propertyId === prop.propertyId ? "#0f2434" : undefined,
                            }}
                          >
                            <td style={{ padding: "4px 6px" }}>{prop.name}</td>
                            <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{prop.alias ?? ""}</td>
                            <td style={{ padding: "4px 6px", color: "#4fc1ff" }}>
                              {(prop.type as any).kind === "builtin" ? (prop.type as any).name : (prop.type as any).kind === "custom" ? (prop.type as any).name : (prop.type as any).kind}
                            </td>
                            <td style={{ padding: "4px 6px" }}>{String(prop.defaultValue ?? "")}</td>
                            <td style={{ padding: "4px 6px" }}>
                              <button
                                className="tree-context-menu-item is-danger"
                                onClick={(e) => { e.stopPropagation(); removeProperty(prop.propertyId); }}
                                style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                type="button"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 计算端口 + 流程端口并排 */}
              <div style={{ display: "flex", gap: 8 }}>
                {/* 计算端口 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="flowchart-node-section-header" style={{ padding: 0 }}>计算端口</span>
                    <button className="secondary-button flowchart-library-add-button" onClick={addComputePort} type="button">+ 添加</button>
                  </div>
                  {computePorts.length === 0 ? (
                    <p className="status-detail" style={{ padding: "4px 0" }}>暂无</p>
                  ) : (
                    <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 120, overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>方向</th>
                            <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {computePorts.map((port) => (
                            <tr
                              key={port.portId}
                              onClick={() => setDetailTarget({ kind: "computePort", portId: port.portId })}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid #2a2a2a",
                                background: detailTarget?.kind === "computePort" && detailTarget.portId === port.portId ? "#0f2434" : undefined,
                              }}
                            >
                              <td style={{ padding: "4px 6px" }}>{port.name}</td>
                              <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{port.direction}</td>
                              <td style={{ padding: "4px 6px" }}>
                                <button
                                  className="tree-context-menu-item is-danger"
                                  onClick={(e) => { e.stopPropagation(); removeComputePort(port.portId); }}
                                  style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 流程端口 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="flowchart-node-section-header" style={{ padding: 0 }}>流程端口</span>
                    <button className="secondary-button flowchart-library-add-button" onClick={addFlowPort} type="button">+ 添加</button>
                  </div>
                  {flowPorts.length === 0 ? (
                    <p className="status-detail" style={{ padding: "4px 0" }}>暂无</p>
                  ) : (
                    <div style={{ background: "#1f1f1f", border: "1px solid #3c3c3c", maxHeight: 120, overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #333", color: "#8b8b8b" }}>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>名称</th>
                            <th style={{ padding: "4px 6px", textAlign: "left" }}>方向</th>
                            <th style={{ padding: "4px 6px", textAlign: "left", width: 50 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {flowPorts.map((port) => (
                            <tr
                              key={port.portId}
                              onClick={() => setDetailTarget({ kind: "flowPort", portId: port.portId })}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid #2a2a2a",
                                background: detailTarget?.kind === "flowPort" && detailTarget.portId === port.portId ? "#0f2434" : undefined,
                              }}
                            >
                              <td style={{ padding: "4px 6px" }}>{port.name}</td>
                              <td style={{ padding: "4px 6px", color: "#8b8b8b" }}>{port.direction}</td>
                              <td style={{ padding: "4px 6px" }}>
                                <button
                                  className="tree-context-menu-item is-danger"
                                  onClick={(e) => { e.stopPropagation(); removeFlowPort(port.portId); }}
                                  style={{ padding: "0 4px", fontSize: 11, border: "none", background: "transparent", color: "#f2b8b5" }}
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 校验错误 */}
              {errors.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, border: "1px solid #5a1d1d", background: "rgba(90,29,29,0.18)" }}>
                  {errors.map((err, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 11, color: "#f2b8b5" }}>{err.field}: {err.message}</p>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ── 右侧：详情编辑面板 ── */}
            <div className="tree-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
              <strong style={{ fontSize: 12 }}>详情编辑</strong>
              {!detailTarget || !detailData ? (
                <p className="status-detail">点击左侧列表中的行展开编辑详情。</p>
              ) : detailTarget.kind === "property" ? (
                <PropertyDetailEditor
                  data={detailData as FlowChartPropertyDefinition}
                  onChange={(patch) => updateProperty(detailTarget.propertyId, patch)}
                  onOpenTypePicker={() => openTypePicker("property", detailTarget.propertyId)}
                />
              ) : detailTarget.kind === "computePort" ? (
                <ComputePortDetailEditor
                  data={detailData as FlowChartComputePortDefinition}
                  onChange={(patch) => updateComputePort(detailTarget.portId, patch)}
                  onOpenTypePicker={() => openTypePicker("computePort", detailTarget.portId)}
                />
              ) : (
                <FlowPortDetailEditor
                  data={detailData as FlowChartFlowPortDefinition}
                  onChange={(patch) => updateFlowPort(detailTarget.portId, patch)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── 底部操作栏 ── */}
        <div className="workspace-create-actions">
          <button className="secondary-button" disabled={isSaving} onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={hasBlockingErrors || isSaving} onClick={() => void handleSubmit()} type="button">
            {isSaving ? "保存中" : "保存定义"}
          </button>
        </div>

        {/* ── TypeComposerDialog ── */}
        {isTypePickerOpen ? (
          <TypeComposerDialog
            allowedKinds={["scalar", "container"]}
            applyLabel="应用到类型"
            currentType=""
            depth={0}
            initialNode={null}
            isOpen={isTypePickerOpen}
            onApplyNode={(node) => handleTypePickerApply(node)}
            onClose={handleTypePickerClose}
            onResolveType={onResolveType}
            subtitle="选择属性/端口的类型"
            title={typePickerTarget === "property" ? "选择属性类型" : "选择端口类型"}
            typeMetadata={typeMetadata as any}
          />
        ) : null}
      </div>
    </DialogBackdrop>
  );
}

// ── 属性详情编辑器 ──
function PropertyDetailEditor({
  data,
  onChange,
  onOpenTypePicker,
}: {
  data: FlowChartPropertyDefinition;
  onChange: (patch: Partial<FlowChartPropertyDefinition>) => void;
  onOpenTypePicker: () => void;
}) {
  const t = data.type as any;
  const isCustomType = t.kind === "custom";
  const typeLabel = isCustomType
    ? t.fullName ?? t.name
    : t.kind === "builtin"
      ? t.name
      : t.kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>类型</span>
        <div style={{ display: "flex", gap: 4 }}>
          <input className="dialog-field-input" readOnly style={{ flex: 1 }} type="text" value={typeLabel} />
          <button className="secondary-button flowchart-library-add-button" onClick={onOpenTypePicker} type="button">选择类型</button>
        </div>
      </label>
      <label className="flowchart-inspector-field">
        <span>默认值</span>
        <input
          className="dialog-field-input"
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          type="text"
          value={String(data.defaultValue ?? "")}
        />
      </label>
    </div>
  );
}

// ── 计算端口详情编辑器 ──
function ComputePortDetailEditor({
  data,
  onChange,
  onOpenTypePicker,
}: {
  data: FlowChartComputePortDefinition;
  onChange: (patch: Partial<FlowChartComputePortDefinition>) => void;
  onOpenTypePicker: () => void;
}) {
  const t = data.type as any;
  const isCustomType = t.kind === "custom";
  const typeLabel = isCustomType
    ? t.fullName ?? t.name
    : t.kind === "builtin"
      ? t.name
      : t.kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>方向</span>
        <select className="dialog-field-select" onChange={(e) => onChange({ direction: e.target.value as PortDirection })} value={data.direction}>
          <option value="input">input</option>
          <option value="output">output</option>
        </select>
      </label>
      <label className="flowchart-inspector-field">
        <span>类型</span>
        <div style={{ display: "flex", gap: 4 }}>
          <input className="dialog-field-input" readOnly style={{ flex: 1 }} type="text" value={typeLabel} />
          <button className="secondary-button flowchart-library-add-button" onClick={onOpenTypePicker} type="button">选择类型</button>
        </div>
      </label>
    </div>
  );
}

// ── 流程端口详情编辑器 ──
function FlowPortDetailEditor({
  data,
  onChange,
}: {
  data: FlowChartFlowPortDefinition;
  onChange: (patch: Partial<FlowChartFlowPortDefinition>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="flowchart-inspector-field">
        <span>名称 *</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ name: e.target.value })} type="text" value={data.name} />
      </label>
      <label className="flowchart-inspector-field">
        <span>别名</span>
        <input className="dialog-field-input" onChange={(e) => onChange({ alias: e.target.value || null })} type="text" value={data.alias ?? ""} />
      </label>
      <label className="flowchart-inspector-field">
        <span>方向</span>
        <select className="dialog-field-select" onChange={(e) => onChange({ direction: e.target.value as PortDirection })} value={data.direction}>
          <option value="input">input</option>
          <option value="output">output</option>
        </select>
      </label>
    </div>
  );
}
