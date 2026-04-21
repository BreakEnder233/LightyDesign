import type { RefObject } from "react";

import { DialogBackdrop } from "./DialogBackdrop";

type McpConfigTargetClient = "vscode";

interface McpConfigDialogProps {
  isOpen: boolean;
  statusLabel: string;
  previewUrl: string;
  serverHost: string;
  portInput: string;
  pathInput: string;
  errorMessage: string | null;
  lastStartError: string | null;
  targetClient: McpConfigTargetClient | null;
  previewJson: string;
  isSaving: boolean;
  isStarting: boolean;
  hasValidPort: boolean;
  isEnabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  onPortInputChange: (value: string) => void;
  onPathInputChange: (value: string) => void;
  onAutoFindPort: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSelectTargetClient: (targetClient: McpConfigTargetClient) => void;
  onStart: () => void | Promise<void>;
  onCopyJson: () => void | Promise<void>;
}

export function McpConfigDialog({
  isOpen,
  statusLabel,
  previewUrl,
  serverHost,
  portInput,
  pathInput,
  errorMessage,
  lastStartError,
  targetClient,
  previewJson,
  isSaving,
  isStarting,
  hasValidPort,
  isEnabled,
  textareaRef,
  onClose,
  onPortInputChange,
  onPathInputChange,
  onAutoFindPort,
  onSave,
  onSelectTargetClient,
  onStart,
  onCopyJson,
}: McpConfigDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div
        aria-label="MCP 服务配置"
        aria-modal="true"
        className="workspace-create-dialog mcp-config-dialog"
        role="dialog"
      >
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">MCP 服务配置</p>
          </div>
        </div>

        <div className="workspace-create-body mcp-config-body">
          <p className="workspace-create-path-label">当前状态</p>
          <p className="workspace-create-path-value">{statusLabel}</p>

          <p className="workspace-create-path-label">服务地址</p>
          <p className="workspace-create-path-value">{previewUrl || "请输入有效端口"}</p>

          <div className="mcp-config-settings-grid">
            <label className="search-field mcp-config-field">
              <span>监听主机</span>
              <input readOnly type="text" value={serverHost} />
            </label>

            <label className="search-field mcp-config-field">
              <span>监听端口</span>
              <input
                inputMode="numeric"
                onChange={(event) => onPortInputChange(event.target.value)}
                placeholder="39231"
                type="text"
                value={portInput}
              />
            </label>
          </div>

          <label className="search-field mcp-config-field">
            <span>HTTP 路径</span>
            <input
              onChange={(event) => onPathInputChange(event.target.value)}
              placeholder="/mcp"
              type="text"
              value={pathInput}
            />
          </label>

          <div className="action-grid compact-grid mcp-config-action-grid">
            <button className="secondary-button" onClick={() => void onAutoFindPort()} type="button">
              自动查找可用端口
            </button>
            <button
              className="secondary-button"
              disabled={isSaving || isStarting}
              onClick={() => void onSave()}
              type="button"
            >
              保存配置
            </button>
          </div>

          {errorMessage || lastStartError ? (
            <p className="column-editor-error">{errorMessage ?? lastStartError}</p>
          ) : null}

          <p className="workspace-create-path-label">目标客户端</p>
          <div className="action-grid compact-grid mcp-config-client-grid">
            <button
              className={`secondary-button mcp-config-client-button${targetClient === "vscode" ? " is-active" : ""}`}
              onClick={() => onSelectTargetClient("vscode")}
              type="button"
            >
              VS Code
            </button>
          </div>

          <p className="workspace-create-path-label codegen-dialog-caption">
            当前仅支持 VS Code。配置保存后会写入用户偏好；正常关闭 Electron 时，LightyDesign 会一并关闭本地 MCP HTTP 服务。
          </p>

          {targetClient ? (
            <label className="search-field mcp-config-field">
              <span>配置 JSON</span>
              <textarea
                className="dialog-field-textarea column-editor-textarea mcp-config-textarea"
                readOnly
                ref={textareaRef}
                value={previewJson}
              />
            </label>
          ) : null}
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            关闭
          </button>
          <button
            className="secondary-button"
            disabled={isSaving || isStarting || !hasValidPort}
            onClick={() => void onStart()}
            type="button"
          >
            {isEnabled ? "按当前配置重启" : "保存并尝试启动"}
          </button>
          <button
            className="primary-button"
            disabled={!previewJson}
            onClick={() => void onCopyJson()}
            type="button"
          >
            复制 JSON
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}