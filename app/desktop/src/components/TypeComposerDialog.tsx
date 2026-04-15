import { useEffect, useMemo, useRef, useState } from "react";

import { DialogBackdrop } from "./DialogBackdrop";

import type {
  TypeDescriptorResponse,
  TypeMetadataContainer,
  TypeMetadataResponse,
  TypeMetadataSlot,
  TypeValidationResponse,
} from "../types/desktopApp";

type TypeKind = "scalar" | "reference" | "container";

type BuilderNode =
  | {
      kind: "scalar";
      scalarType: string;
    }
  | {
      kind: "reference";
      workbookName: string;
      sheetName: string;
    }
  | {
      kind: "container";
      containerType: "List" | "Dictionary";
      elementType: BuilderNode | null;
      keyType: BuilderNode | null;
      valueType: BuilderNode | null;
    };

type TypeComposerDialogProps = {
  currentType: string;
  isOpen: boolean;
  typeMetadata: TypeMetadataResponse | null;
  onClose: () => void;
  onApply: (nextType: string) => void;
  onResolveType: (type: string) => Promise<TypeValidationResponse>;
};

type NodeEditorProps = {
  label: string;
  allowedKinds: TypeKind[];
  metadata: TypeMetadataResponse;
  node: BuilderNode | null;
  onChange: (node: BuilderNode) => void;
  layout?: "sidebar" | "inline";
};

function getNodeKind(node: BuilderNode | null): TypeKind | null {
  return node?.kind ?? null;
}

function buildDefaultNode(kind: TypeKind, metadata: TypeMetadataResponse): BuilderNode {
  if (kind === "scalar") {
    return {
      kind: "scalar",
      scalarType: metadata.scalarTypes[0] ?? "string",
    };
  }

  if (kind === "reference") {
    const workbook = metadata.referenceTargets[0];
    return {
      kind: "reference",
      workbookName: workbook?.workbookName ?? "",
      sheetName: workbook?.sheetNames[0] ?? "",
    };
  }

  return {
    kind: "container",
    containerType: "List",
    elementType: buildDefaultNode("scalar", metadata),
    keyType: null,
    valueType: null,
  };
}

function getAllowedKindsForContainerSlot(slot: TypeMetadataSlot): TypeKind[] {
  return slot.allowedKinds;
}

function getContainerMetadata(metadata: TypeMetadataResponse, containerType: "List" | "Dictionary"): TypeMetadataContainer {
  const resolved = metadata.containerTypes.find((entry) => entry.typeName === containerType);
  if (!resolved) {
    throw new Error(`Container type '${containerType}' is not defined in type metadata.`);
  }

  return resolved;
}

function getContainerSlot(
  metadata: TypeMetadataResponse,
  containerType: "List" | "Dictionary",
  slotIndex: number,
): TypeMetadataSlot | null {
  const container = getContainerMetadata(metadata, containerType);
  const slot = container.slots[slotIndex] ?? null;

  if (!slot) {
    console.error(`Container type '${containerType}' is missing slot #${slotIndex}.`, container);
  }

  return slot;
}

function formatBuilderNode(node: BuilderNode | null): string {
  if (!node) {
    return "";
  }

  if (node.kind === "scalar") {
    return node.scalarType.trim();
  }

  if (node.kind === "reference") {
    if (!node.workbookName || !node.sheetName) {
      return "";
    }

    return `Ref:${node.workbookName}.${node.sheetName}`;
  }

  if (node.containerType === "List") {
    const elementType = formatBuilderNode(node.elementType);
    return elementType ? `List<${elementType}>` : "";
  }

  const keyType = formatBuilderNode(node.keyType);
  const valueType = formatBuilderNode(node.valueType);
  return keyType && valueType ? `Dictionary<${keyType},${valueType}>` : "";
}

function buildNodeFromDescriptor(descriptor: TypeDescriptorResponse): BuilderNode {
  if (descriptor.isList) {
    return {
      kind: "container",
      containerType: "List",
      elementType: descriptor.children[0] ? buildNodeFromDescriptor(descriptor.children[0]) : null,
      keyType: null,
      valueType: null,
    };
  }

  if (descriptor.isDictionary) {
    return {
      kind: "container",
      containerType: "Dictionary",
      elementType: null,
      keyType: descriptor.children[0] ? buildNodeFromDescriptor(descriptor.children[0]) : null,
      valueType: descriptor.children[1] ? buildNodeFromDescriptor(descriptor.children[1]) : null,
    };
  }

  if (descriptor.isReference) {
    return {
      kind: "reference",
      workbookName: descriptor.referenceTarget?.workbookName ?? "",
      sheetName: descriptor.referenceTarget?.sheetName ?? "",
    };
  }

  return {
    kind: "scalar",
    scalarType: descriptor.rawType,
  };
}

function buildDefaultContainerNode(containerType: "List" | "Dictionary", metadata: TypeMetadataResponse): BuilderNode {
  if (containerType === "List") {
    return {
      kind: "container",
      containerType,
      elementType: buildDefaultNode("scalar", metadata),
      keyType: null,
      valueType: null,
    };
  }

  return {
    kind: "container",
    containerType,
    elementType: null,
    keyType: buildDefaultNode("scalar", metadata),
    valueType: buildDefaultNode("scalar", metadata),
  };
}

function TypeNodeEditor({ label, allowedKinds, metadata, node, onChange, layout = "inline" }: NodeEditorProps) {
  const currentKind = useMemo<TypeKind>(() => {
    const nodeKind = getNodeKind(node);
    if (nodeKind && allowedKinds.includes(nodeKind)) {
      return nodeKind;
    }

    return allowedKinds[0] ?? "scalar";
  }, [allowedKinds, node]);

  const resolvedNode = useMemo(() => {
    if (node && node.kind === currentKind) {
      return node;
    }

    return buildDefaultNode(currentKind, metadata);
  }, [currentKind, metadata, node]);

  const [activeKind, setActiveKind] = useState<TypeKind>(currentKind);

  useEffect(() => {
    setActiveKind(currentKind);
  }, [currentKind]);

  const displayedNode = activeKind === resolvedNode.kind ? resolvedNode : buildDefaultNode(activeKind, metadata);
  const referenceSheets = displayedNode.kind === "reference"
    ? metadata.referenceTargets.find((entry) => entry.workbookName === displayedNode.workbookName)?.sheetNames ?? []
    : [];
  const listElementSlot = displayedNode.kind === "container" && displayedNode.containerType === "List"
    ? getContainerSlot(metadata, "List", 0)
    : null;
  const dictionaryKeySlot = displayedNode.kind === "container" && displayedNode.containerType === "Dictionary"
    ? getContainerSlot(metadata, "Dictionary", 0)
    : null;
  const dictionaryValueSlot = displayedNode.kind === "container" && displayedNode.containerType === "Dictionary"
    ? getContainerSlot(metadata, "Dictionary", 1)
    : null;

  function handleChangeKind(kind: TypeKind) {
    setActiveKind(kind);
    onChange(buildDefaultNode(kind, metadata));
  }

  const layoutClassName = layout === "sidebar" ? "type-composer-layout type-composer-layout--sidebar" : "type-composer-layout";

  return (
    <section className="type-composer-section">
      <div className="type-composer-section-header">
        <strong>{label}</strong>
        <span>{formatBuilderNode(displayedNode) || "待选择"}</span>
      </div>

      <div className={layoutClassName}>
        <div className="type-composer-kind-rail">
          <span className="type-composer-kind-rail-label">类型类别</span>
          <div className="type-composer-kind-tabs" role="tablist" aria-label={`${label} 类型类别`}>
            {allowedKinds.map((kind) => (
              <button
                className={`type-composer-kind-tab${activeKind === kind ? " is-active" : ""}`}
                key={kind}
                onClick={() => {
                  handleChangeKind(kind);
                }}
                type="button"
              >
                {kind === "scalar" ? "基础类型" : kind === "reference" ? "表引用" : "容器类型"}
              </button>
            ))}
          </div>
        </div>

        <div className="type-composer-panel">
          {displayedNode.kind === "scalar" ? (
            <div className="type-composer-scalar-grid">
              {metadata.scalarTypes.map((scalarType) => (
                <button
                  className={`type-composer-chip${displayedNode.scalarType === scalarType ? " is-active" : ""}`}
                  key={scalarType}
                  onClick={() => {
                    onChange({
                      kind: "scalar",
                      scalarType,
                    });
                  }}
                  type="button"
                >
                  {scalarType}
                </button>
              ))}
            </div>
          ) : null}

          {displayedNode.kind === "reference" ? (
            <div className="type-composer-reference-grid">
              <label className="search-field column-editor-field">
                <span>工作簿</span>
                <select
                  className="dialog-field-select"
                  onChange={(event) => {
                    const workbookName = event.target.value;
                    const sheetNames = metadata.referenceTargets.find((entry) => entry.workbookName === workbookName)?.sheetNames ?? [];
                    onChange({
                      kind: "reference",
                      workbookName,
                      sheetName: sheetNames[0] ?? "",
                    });
                  }}
                  value={displayedNode.workbookName}
                >
                  {metadata.referenceTargets.length === 0 ? <option value="">当前工作区没有可引用表</option> : null}
                  {metadata.referenceTargets.map((target) => (
                    <option key={target.workbookName} value={target.workbookName}>
                      {target.workbookName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="search-field column-editor-field">
                <span>表格</span>
                <select
                  className="dialog-field-select"
                  onChange={(event) => {
                    onChange({
                      kind: "reference",
                      workbookName: displayedNode.workbookName,
                      sheetName: event.target.value,
                    });
                  }}
                  value={displayedNode.sheetName}
                >
                  {referenceSheets.length === 0 ? <option value="">没有可选表格</option> : null}
                  {referenceSheets.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {displayedNode.kind === "container" ? (
            <div className="type-composer-container-body">
              <div className="type-composer-scalar-grid type-composer-container-selector">
                {["List", "Dictionary"].map((containerType) => (
                  <button
                    className={`type-composer-chip${displayedNode.containerType === containerType ? " is-active" : ""}`}
                    key={containerType}
                    onClick={() => {
                      onChange(buildDefaultContainerNode(containerType as "List" | "Dictionary", metadata));
                    }}
                    type="button"
                  >
                    {containerType}
                  </button>
                ))}
              </div>

              {displayedNode.containerType === "List" ? (
                listElementSlot ? (
                  <TypeNodeEditor
                    allowedKinds={getAllowedKindsForContainerSlot(listElementSlot)}
                    label="元素类型"
                    layout="inline"
                    metadata={metadata}
                    node={displayedNode.elementType}
                    onChange={(elementType) => {
                      onChange({
                        ...displayedNode,
                        elementType,
                      });
                    }}
                  />
                ) : (
                  <p className="column-editor-error">List 类型元数据缺少元素槽位，暂时无法继续编辑。</p>
                )
              ) : null}

              {displayedNode.containerType === "Dictionary" ? (
                <div className="type-composer-dictionary-grid">
                  {dictionaryKeySlot ? (
                    <TypeNodeEditor
                      allowedKinds={getAllowedKindsForContainerSlot(dictionaryKeySlot)}
                      label="Key 类型"
                      layout="inline"
                      metadata={metadata}
                      node={displayedNode.keyType}
                      onChange={(keyType) => {
                        onChange({
                          ...displayedNode,
                          keyType,
                        });
                      }}
                    />
                  ) : (
                    <p className="column-editor-error">Dictionary 类型元数据缺少 Key 槽位。</p>
                  )}
                  {dictionaryValueSlot ? (
                    <TypeNodeEditor
                      allowedKinds={getAllowedKindsForContainerSlot(dictionaryValueSlot)}
                      label="Value 类型"
                      layout="inline"
                      metadata={metadata}
                      node={displayedNode.valueType}
                      onChange={(valueType) => {
                        onChange({
                          ...displayedNode,
                          valueType,
                        });
                      }}
                    />
                  ) : (
                    <p className="column-editor-error">Dictionary 类型元数据缺少 Value 槽位。</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function TypeComposerDialog({
  currentType,
  isOpen,
  typeMetadata,
  onClose,
  onApply,
  onResolveType,
}: TypeComposerDialogProps) {
  const [draftNode, setDraftNode] = useState<BuilderNode | null>(null);
  const [isResolvingCurrentType, setIsResolvingCurrentType] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const openSessionRef = useRef(0);
  const initializedSessionRef = useRef<number | null>(null);
  const previewType = useMemo(() => formatBuilderNode(draftNode), [draftNode]);

  useEffect(() => {
    if (isOpen) {
      openSessionRef.current += 1;
      initializedSessionRef.current = null;
      return;
    }

    setDraftNode(null);
    setIsResolvingCurrentType(false);
    setLoadError(null);
    setSubmitError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !typeMetadata) {
      return;
    }

    if (initializedSessionRef.current === openSessionRef.current) {
      return;
    }

    initializedSessionRef.current = openSessionRef.current;

    setSubmitError(null);
    setLoadError(null);

    const normalizedCurrentType = currentType.trim();
    if (!normalizedCurrentType) {
      setDraftNode(buildDefaultNode("scalar", typeMetadata));
      setIsResolvingCurrentType(false);
      return;
    }

    setIsResolvingCurrentType(true);
    let cancelled = false;
    const resolveType = onResolveType;

    void resolveType(normalizedCurrentType)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.descriptor) {
          setDraftNode(buildDefaultNode("scalar", typeMetadata));
          setLoadError(result.message ?? "当前类型无法解析，请重新选择。");
          return;
        }

        setDraftNode(buildNodeFromDescriptor(result.descriptor));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setDraftNode(buildDefaultNode("scalar", typeMetadata));
        setLoadError(error instanceof Error ? error.message : "当前类型无法解析，请重新选择。");
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolvingCurrentType(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentType, isOpen, onResolveType, typeMetadata]);

  if (!isOpen) {
    return null;
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label="快速填写类型" aria-modal="true" className="workspace-create-dialog type-composer-dialog" role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">快速填写 / 类型构造器</p>
          </div>
          <span className="badge">{previewType || "待完成"}</span>
        </div>

        <div className="workspace-create-body type-composer-body">
          {!typeMetadata ? <p className="column-editor-error">类型元数据尚未加载完成。</p> : null}
          {isResolvingCurrentType ? <p className="column-editor-validation">正在解析当前类型...</p> : null}
          {loadError ? <p className="column-editor-validation column-editor-validation--invalid">{loadError}</p> : null}

          {typeMetadata && draftNode ? (
            <>
              <div className="type-composer-preview">
                <strong>预览</strong>
                <code>{previewType || "尚未完成"}</code>
              </div>

              <TypeNodeEditor
                allowedKinds={["scalar", "reference", "container"]}
                label="类型定义"
                layout="sidebar"
                metadata={typeMetadata}
                node={draftNode}
                onChange={(node) => {
                  setDraftNode(node);
                  setSubmitError(null);
                }}
              />
            </>
          ) : null}

          {submitError ? <p className="column-editor-error">{submitError}</p> : null}
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={!typeMetadata || !draftNode || !previewType}
            onClick={() => {
              if (!previewType) {
                setSubmitError("请先完成类型选择。");
                return;
              }

              void onResolveType(previewType)
                .then((result) => {
                  if (!result.ok) {
                    setSubmitError(result.message ?? "类型校验失败。");
                    return;
                  }

                  onApply(result.normalizedType ?? previewType);
                  onClose();
                })
                .catch((error) => {
                  setSubmitError(error instanceof Error ? error.message : "类型校验失败。");
                });
            }}
            type="button"
          >
            应用到 Type
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}