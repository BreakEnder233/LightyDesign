import { useEffect, useMemo, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";
import type { FlowChartCatalogResponse } from "../types/flowchartEditor";

type FlowChartNodeDialogProps = {
  isOpen: boolean;
  catalog: FlowChartCatalogResponse | null;
  initialNodeType: string | null;
  onClose: () => void;
  onSubmit: (nodeType: string) => void | Promise<void>;
};

function buildNodeLabel(name: string, alias?: string | null) {
  return alias?.trim() ? `${alias} · ${name}` : name;
}

export function FlowChartNodeDialog({ isOpen, catalog, initialNodeType, onClose, onSubmit }: FlowChartNodeDialogProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(initialNodeType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredDefinitions = useMemo(() => {
    if (!catalog) {
      return [];
    }

    const keyword = searchText.trim().toLowerCase();
    return catalog.nodeDefinitions.filter((definition) => {
      if (!keyword) {
        return true;
      }

      const haystack = `${definition.relativePath} ${definition.name} ${definition.alias ?? ""} ${definition.nodeKind}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [catalog, searchText]);

  const selectedDefinition = filteredDefinitions.find((definition) => definition.relativePath === selectedNodeType)
    ?? catalog?.nodeDefinitions.find((definition) => definition.relativePath === selectedNodeType)
    ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchText("");
    setSelectedNodeType(initialNodeType ?? catalog?.nodeDefinitions[0]?.relativePath ?? null);
    setIsSubmitting(false);
  }, [catalog?.nodeDefinitions, initialNodeType, isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit() {
    if (!selectedNodeType) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedNodeType);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label="新建节点" aria-modal="true" className="workspace-create-dialog flowchart-node-dialog" role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">新建节点</p>
            <strong>从节点库选择一个类型添加到当前画布</strong>
          </div>
          {catalog ? <span className="badge">{catalog.nodeDefinitions.length} 个类型</span> : null}
        </div>

        <div className="workspace-create-body">
          <label className="search-field compact-field">
            <span>搜索节点</span>
            <input
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="按名称、别名、路径或节点种类过滤"
              type="search"
              value={searchText}
            />
          </label>

          <div className="flowchart-node-dialog-grid">
            <div className="flowchart-node-dialog-list" role="listbox">
              {filteredDefinitions.length === 0 ? (
                <div className="empty-panel flowchart-sidebar-empty is-compact">
                  <strong>没有匹配的节点定义</strong>
                  <p>尝试调整搜索关键字。</p>
                </div>
              ) : (
                filteredDefinitions.map((definition) => (
                  <button
                    className={`flowchart-node-dialog-card${selectedNodeType === definition.relativePath ? " is-selected" : ""}`}
                    key={definition.relativePath}
                    onClick={() => setSelectedNodeType(definition.relativePath)}
                    type="button"
                  >
                    <div className="flowchart-library-copy">
                      <span>{definition.relativePath}</span>
                      <strong>{buildNodeLabel(definition.name, definition.alias)}</strong>
                    </div>
                    <span className={`flowchart-kind-badge is-${definition.nodeKind}`}>{definition.nodeKind}</span>
                  </button>
                ))
              )}
            </div>

            <div className="tree-card flowchart-node-dialog-preview">
              <div className="section-header">
                <div>
                  <p className="eyebrow">已选节点</p>
                  <strong>{selectedDefinition ? buildNodeLabel(selectedDefinition.name, selectedDefinition.alias) : "尚未选择"}</strong>
                </div>
              </div>

              {selectedDefinition ? (
                <>
                  <div className="flowchart-dialog-static-field">
                    <span>节点种类</span>
                    <strong>{selectedDefinition.nodeKind}</strong>
                  </div>
                  <div className="flowchart-dialog-static-field">
                    <span>定义路径</span>
                    <strong>{selectedDefinition.relativePath}</strong>
                  </div>
                  <p className="workspace-create-path-label">确认后会将该节点加入当前流程图，并按当前选区附近自动放置。</p>
                </>
              ) : (
                <p className="status-detail">请选择一个节点定义后再添加。</p>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" disabled={!selectedNodeType || isSubmitting} onClick={() => void handleSubmit()} type="button">
            {isSubmitting ? "添加中" : "添加节点"}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}