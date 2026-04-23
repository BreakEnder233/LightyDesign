import { useEffect, useState } from "react";

import { DialogBackdrop } from "../../components/DialogBackdrop";

type FlowChartMetadataDialogProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialRelativePath: string;
  initialName: string;
  initialAlias: string;
  onClose: () => void;
  onSubmit: (value: { relativePath: string; name: string; alias?: string | null }) => void | Promise<void>;
};

export function FlowChartMetadataDialog({
  isOpen,
  mode,
  initialRelativePath,
  initialName,
  initialAlias,
  onClose,
  onSubmit,
}: FlowChartMetadataDialogProps) {
  const [relativePath, setRelativePath] = useState(initialRelativePath);
  const [name, setName] = useState(initialName);
  const [alias, setAlias] = useState(initialAlias);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setRelativePath(initialRelativePath);
    setName(initialName);
    setAlias(initialAlias);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [initialAlias, initialName, initialRelativePath, isOpen]);

  if (!isOpen) {
    return null;
  }

  const title = mode === "create" ? "新建流程图" : "重命名 / 编辑元信息";
  const submitLabel = mode === "create" ? "创建流程图" : "保存修改";

  async function handleSubmit() {
    const trimmedRelativePath = relativePath.trim();
    const trimmedName = name.trim();

    if (trimmedRelativePath.length === 0) {
      setErrorMessage("请输入流程图相对路径。\n路径会自动保存到 FlowCharts/Files 下，并自动补 .json 扩展名。");
      return;
    }

    if (mode === "edit" && trimmedName.length === 0) {
      setErrorMessage("流程图名称不能为空。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        relativePath: trimmedRelativePath,
        name: trimmedName,
        alias: alias.trim() ? alias.trim() : null,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div aria-label={title} aria-modal="true" className="workspace-create-dialog flowchart-meta-dialog" role="dialog">
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{title}</p>
            <strong>{mode === "create" ? "创建新的流程图文件" : "修改流程图路径、名称与展示信息"}</strong>
          </div>
        </div>

        <div className="workspace-create-body">
          <label className="flowchart-inspector-field compact-field">
            <span>相对路径</span>
            <input
              className="dialog-field-input"
              onChange={(event) => setRelativePath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="例如 Gameplay/MainLoop 或 Quests/QuestStart"
              type="text"
              value={relativePath}
            />
          </label>

          <label className="flowchart-inspector-field compact-field">
            <span>名称</span>
            <input
              className="dialog-field-input"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="用于流程图文档内部的名称"
              type="text"
              value={name}
            />
          </label>

          <label className="flowchart-inspector-field compact-field">
            <span>别名</span>
            <input
              className="dialog-field-input"
              onChange={(event) => setAlias(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="可选展示名"
              type="text"
              value={alias}
            />
          </label>

          <p className="workspace-create-path-label">
            {mode === "create"
              ? "路径相对于 FlowCharts/Files；保存时会自动创建子目录并补 .json 扩展名。"
              : "保存后会直接更新流程图文件路径和元信息，无需再额外手动保存。"}
          </p>

          {errorMessage ? <p className="status-detail flowchart-save-error">{errorMessage}</p> : null}
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" disabled={isSubmitting} onClick={() => void handleSubmit()} type="button">
            {isSubmitting ? "处理中" : submitLabel}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}