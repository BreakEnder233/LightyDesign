import { useEffect, useMemo, useState } from "react";

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

function getDirectoryPrefix(relativePath: string) {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash >= 0 ? relativePath.substring(0, lastSlash) : "";
}

function getFileName(relativePath: string) {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? "";
}

export function FlowChartMetadataDialog({
  isOpen,
  mode,
  initialRelativePath,
  initialName,
  initialAlias,
  onClose,
  onSubmit,
}: FlowChartMetadataDialogProps) {
  const [name, setName] = useState(initialName);
  const [alias, setAlias] = useState(initialAlias);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const directoryPrefix = useMemo(() => getDirectoryPrefix(initialRelativePath), [initialRelativePath]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // 以文件名（relativePath 最后一段）为准，保证 name === filename
    const fileName = getFileName(initialRelativePath) || initialName;
    setName(fileName);
    setAlias(initialAlias);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [initialAlias, initialRelativePath, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) {
    return null;
  }

  const title = mode === "create" ? "新建流程图" : "重命名 / 编辑元信息";
  const submitLabel = mode === "create" ? "创建流程图" : "保存修改";

  async function handleSubmit() {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      setErrorMessage("流程图名称不能为空。");
      return;
    }

    if (trimmedName.includes("/") || trimmedName.includes("\\")) {
      setErrorMessage("名称不能包含路径分隔符（/ 或 \\）。");
      return;
    }

    const relativePath = directoryPrefix
      ? `${directoryPrefix}/${trimmedName}`
      : trimmedName;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        relativePath,
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
            <span>名称（文件名）</span>
            <input
              autoFocus
              className="dialog-field-input"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="例如 MainLoop"
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
              ? `路径基于名称自动生成（保存在 ${directoryPrefix ? `${directoryPrefix}/` : ""}{名称}.json）。如需修改存放目录，请在侧栏中通过拖拽移动。`
              : `保存后文件名将等于名称，原路径 ${directoryPrefix ? `${directoryPrefix}/` : ""}{之前名称}.json 会自动更新。`}
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