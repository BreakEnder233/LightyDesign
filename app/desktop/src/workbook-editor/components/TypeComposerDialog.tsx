import { useEffect, useMemo, useRef, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";

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
  onApply?: (nextType: string) => void;
  onApplyNode?: (nextNode: BuilderNode, nextType: string) => void;
  onResolveType: (type: string) => Promise<TypeValidationResponse>;
  allowedKinds?: TypeKind[];
  initialNode?: BuilderNode | null;
  title?: string;
  subtitle?: string;
  applyLabel?: string;
  depth?: number;
};

type NodeEditorProps = {
  label: string;
  allowedKinds: TypeKind[];
  metadata: TypeMetadataResponse;
  node: BuilderNode | null;
  onChange: (node: BuilderNode) => void;
  onResolveType: (type: string) => Promise<TypeValidationResponse>;
  layout?: "sidebar" | "inline";
  depth?: number;
};

type SlotEditorState = {
  label: string;
  allowedKinds: TypeKind[];
  node: BuilderNode | null;
  onApply: (node: BuilderNode) => void;
};

function getNodeKind(node: BuilderNode | null): TypeKind | null {
  return node?.kind ?? null;
}

function getEffectiveAllowedKinds(allowedKinds?: TypeKind[]): TypeKind[] {
  return allowedKinds && allowedKinds.length > 0 ? allowedKinds : ["scalar", "reference", "container"];
}

function isNodeKindAllowed(node: BuilderNode | null, allowedKinds: TypeKind[]) {
  return !!node && allowedKinds.includes(node.kind);
}

function describeTypeKind(kind: TypeKind) {
  return kind === "scalar" ? "基础类型" : kind === "reference" ? "表引用" : "容器类型";
}

function formatAllowedKinds(allowedKinds: TypeKind[]) {
  return getEffectiveAllowedKinds(allowedKinds).map(describeTypeKind).join(" / ");
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

function buildDefaultNodeForAllowedKinds(allowedKinds: TypeKind[], metadata: TypeMetadataResponse) {
  return buildDefaultNode(getEffectiveAllowedKinds(allowedKinds)[0] ?? "scalar", metadata);
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

function TypeNodeEditor({
  label,
  allowedKinds,
  metadata,
  node,
  onChange,
  onResolveType,
  layout = "inline",
  depth = 0,
}: NodeEditorProps) {
  const effectiveAllowedKinds = useMemo(() => getEffectiveAllowedKinds(allowedKinds), [allowedKinds]);
  const currentKind = useMemo<TypeKind>(() => {
    const nodeKind = getNodeKind(node);
    if (nodeKind && effectiveAllowedKinds.includes(nodeKind)) {
      return nodeKind;
    }

    return effectiveAllowedKinds[0] ?? "scalar";
  }, [effectiveAllowedKinds, node]);

  const resolvedNode = useMemo(() => {
    if (node && node.kind === currentKind) {
      return node;
    }

    return buildDefaultNode(currentKind, metadata);
  }, [currentKind, metadata, node]);

  const [activeKind, setActiveKind] = useState<TypeKind>(currentKind);
  const displayedNode = activeKind === resolvedNode.kind ? resolvedNode : buildDefaultNode(activeKind, metadata);
  const [slotEditor, setSlotEditor] = useState<SlotEditorState | null>(null);

  useEffect(() => {
    setActiveKind(currentKind);
  }, [currentKind]);

  useEffect(() => {
    if (displayedNode.kind !== "container" && slotEditor) {
      setSlotEditor(null);
    }
  }, [displayedNode, slotEditor]);

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

  function openSlotEditor(nextEditor: SlotEditorState) {
    setSlotEditor({
      ...nextEditor,
      allowedKinds: getEffectiveAllowedKinds(nextEditor.allowedKinds),
    });
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
            {effectiveAllowedKinds.map((kind) => (
              <button
                className={`type-composer-kind-tab${activeKind === kind ? " is-active" : ""}`}
                key={kind}
                onClick={() => {
                  handleChangeKind(kind);
                }}
                type="button"
              >
                {describeTypeKind(kind)}
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
                  <section className="type-composer-slot-card">
                    <div className="type-composer-slot-card-header">
                      <strong>元素类型</strong>
                      <span>{formatBuilderNode(displayedNode.elementType) || "待选择"}</span>
                    </div>
                    <p className="type-composer-slot-card-hint">
                      允许: {formatAllowedKinds(getAllowedKindsForContainerSlot(listElementSlot))}
                    </p>
                    <button
                      className="secondary-button type-composer-slot-action"
                      onClick={() => {
                        openSlotEditor({
                          allowedKinds: getAllowedKindsForContainerSlot(listElementSlot),
                          label: "元素类型",
                          node: displayedNode.elementType,
                          onApply: (elementType) => {
                            onChange({
                              ...displayedNode,
                              elementType,
                            });
                          },
                        });
                      }}
                      type="button"
                    >
                      快速填写元素类型
                    </button>
                  </section>
                ) : (
                  <p className="column-editor-error">List 类型元数据缺少元素槽位，暂时无法继续编辑。</p>
                )
              ) : null}

              {displayedNode.containerType === "Dictionary" ? (
                <div className="type-composer-dictionary-grid">
                  {dictionaryKeySlot ? (
                    <section className="type-composer-slot-card">
                      <div className="type-composer-slot-card-header">
                        <strong>Key 类型</strong>
                        <span>{formatBuilderNode(displayedNode.keyType) || "待选择"}</span>
                      </div>
                      <p className="type-composer-slot-card-hint">
                        允许: {formatAllowedKinds(getAllowedKindsForContainerSlot(dictionaryKeySlot))}
                      </p>
                      <button
                        className="secondary-button type-composer-slot-action"
                        onClick={() => {
                          openSlotEditor({
                            allowedKinds: getAllowedKindsForContainerSlot(dictionaryKeySlot),
                            label: "Key 类型",
                            node: displayedNode.keyType,
                            onApply: (keyType) => {
                              onChange({
                                ...displayedNode,
                                keyType,
                              });
                            },
                          });
                        }}
                        type="button"
                      >
                        快速填写 Key 类型
                      </button>
                    </section>
                  ) : (
                    <p className="column-editor-error">Dictionary 类型元数据缺少 Key 槽位。</p>
                  )}
                  {dictionaryValueSlot ? (
                    <section className="type-composer-slot-card">
                      <div className="type-composer-slot-card-header">
                        <strong>Value 类型</strong>
                        <span>{formatBuilderNode(displayedNode.valueType) || "待选择"}</span>
                      </div>
                      <p className="type-composer-slot-card-hint">
                        允许: {formatAllowedKinds(getAllowedKindsForContainerSlot(dictionaryValueSlot))}
                      </p>
                      <button
                        className="secondary-button type-composer-slot-action"
                        onClick={() => {
                          openSlotEditor({
                            allowedKinds: getAllowedKindsForContainerSlot(dictionaryValueSlot),
                            label: "Value 类型",
                            node: displayedNode.valueType,
                            onApply: (valueType) => {
                              onChange({
                                ...displayedNode,
                                valueType,
                              });
                            },
                          });
                        }}
                        type="button"
                      >
                        快速填写 Value 类型
                      </button>
                    </section>
                  ) : (
                    <p className="column-editor-error">Dictionary 类型元数据缺少 Value 槽位。</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {slotEditor ? (
        <TypeComposerDialog
          allowedKinds={slotEditor.allowedKinds}
          applyLabel={`应用到${slotEditor.label}`}
          currentType={formatBuilderNode(slotEditor.node)}
          depth={depth + 1}
          initialNode={slotEditor.node}
          isOpen
          onApplyNode={(nextNode) => {
            slotEditor.onApply(nextNode);
            setSlotEditor(null);
          }}
          onClose={() => {
            setSlotEditor(null);
          }}
          onResolveType={onResolveType}
          subtitle={`允许: ${formatAllowedKinds(slotEditor.allowedKinds)}`}
          title={`快速填写 / ${slotEditor.label}`}
          typeMetadata={metadata}
        />
      ) : null}
    </section>
  );
}

export function TypeComposerDialog({
  currentType,
  isOpen,
  typeMetadata,
  onClose,
  onApply,
  onApplyNode,
  onResolveType,
  allowedKinds,
  initialNode,
  title = "快速填写 / 类型构造器",
  subtitle,
  applyLabel = "应用到 Type",
  depth = 0,
}: TypeComposerDialogProps) {
  const [draftNode, setDraftNode] = useState<BuilderNode | null>(null);
  const [isResolvingCurrentType, setIsResolvingCurrentType] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const openSessionRef = useRef(0);
  const initializedSessionRef = useRef<number | null>(null);
  const effectiveAllowedKinds = useMemo(() => getEffectiveAllowedKinds(allowedKinds), [allowedKinds]);
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

    if (initialNode !== undefined) {
      if (isNodeKindAllowed(initialNode, effectiveAllowedKinds)) {
        setDraftNode(initialNode);
      } else {
        setDraftNode(buildDefaultNodeForAllowedKinds(effectiveAllowedKinds, typeMetadata));
        if (initialNode) {
          setLoadError(`当前类型不满足限制，仅允许 ${formatAllowedKinds(effectiveAllowedKinds)}。`);
        }
      }

      setIsResolvingCurrentType(false);
      return;
    }

    const normalizedCurrentType = currentType.trim();
    if (!normalizedCurrentType) {
      setDraftNode(buildDefaultNodeForAllowedKinds(effectiveAllowedKinds, typeMetadata));
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
          setDraftNode(buildDefaultNodeForAllowedKinds(effectiveAllowedKinds, typeMetadata));
          setLoadError(result.message ?? "当前类型无法解析，请重新选择。");
          return;
        }

        const nextNode = buildNodeFromDescriptor(result.descriptor);
        if (!isNodeKindAllowed(nextNode, effectiveAllowedKinds)) {
          setDraftNode(buildDefaultNodeForAllowedKinds(effectiveAllowedKinds, typeMetadata));
          setLoadError(`当前类型不满足限制，仅允许 ${formatAllowedKinds(effectiveAllowedKinds)}。`);
          return;
        }

        setDraftNode(nextNode);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setDraftNode(buildDefaultNodeForAllowedKinds(effectiveAllowedKinds, typeMetadata));
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
  }, [currentType, effectiveAllowedKinds, initialNode, isOpen, onResolveType, typeMetadata]);

  if (!isOpen) {
    return null;
  }

  const backdropClassName = depth > 0 ? "workspace-create-backdrop workspace-create-backdrop--nested" : "workspace-create-backdrop";
  const dialogClassName = depth > 0
    ? "workspace-create-dialog type-composer-dialog type-composer-dialog--nested"
    : "workspace-create-dialog type-composer-dialog";

  return (
    <DialogBackdrop className={backdropClassName} onClose={onClose}>
      <div aria-label={title} aria-modal="true" className={dialogClassName} role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{title}</p>
          </div>
          <span className="badge">{previewType || "待完成"}</span>
        </div>

        <div className="workspace-create-body type-composer-body">
          {subtitle ? <p className="type-composer-subtitle">{subtitle}</p> : null}
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
                allowedKinds={effectiveAllowedKinds}
                depth={depth}
                label="类型定义"
                layout="sidebar"
                metadata={typeMetadata}
                node={draftNode}
                onChange={(node) => {
                  setDraftNode(node);
                  setSubmitError(null);
                }}
                onResolveType={onResolveType}
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

                  const nextType = result.normalizedType ?? previewType;
                  const nextNode = result.descriptor ? buildNodeFromDescriptor(result.descriptor) : draftNode;
                  if (!nextNode) {
                    setSubmitError("请先完成类型选择。");
                    return;
                  }

                  if (!isNodeKindAllowed(nextNode, effectiveAllowedKinds)) {
                    setSubmitError(`当前类型不满足限制，仅允许 ${formatAllowedKinds(effectiveAllowedKinds)}。`);
                    return;
                  }

                  onApply?.(nextType);
                  onApplyNode?.(nextNode, nextType);
                  onClose();
                })
                .catch((error) => {
                  setSubmitError(error instanceof Error ? error.message : "类型校验失败。");
                });
            }}
            type="button"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}