import type { ReactNode, RefObject } from "react";

import { DialogBackdrop } from "./DialogBackdrop";

interface NameInputDialogProps {
  isOpen: boolean;
  ariaLabel: string;
  title: string;
  pathLabel?: string;
  pathValue?: ReactNode;
  inputLabel: string;
  placeholder: string;
  value: string;
  submitLabel: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  inputRef?: RefObject<HTMLInputElement | null>;
  selectOnFocus?: boolean;
}

export function NameInputDialog({
  isOpen,
  ariaLabel,
  title,
  pathLabel,
  pathValue,
  inputLabel,
  placeholder,
  value,
  submitLabel,
  onChange,
  onClose,
  onSubmit,
  inputRef,
  selectOnFocus = false,
}: NameInputDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <DialogBackdrop className="workspace-create-backdrop" onClose={onClose}>
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className="workspace-create-dialog"
        role="dialog"
      >
        <div className="workspace-create-header">
          <div>
            <p className="eyebrow">{title}</p>
          </div>
        </div>

        <div className="workspace-create-body">
          {pathLabel ? <p className="workspace-create-path-label">{pathLabel}</p> : null}
          {pathValue !== undefined ? <p className="workspace-create-path-value">{pathValue}</p> : null}

          <label className="search-field workspace-create-name-field">
            <span>{inputLabel}</span>
            <input
              autoFocus
              ref={inputRef}
              onChange={(event) => onChange(event.target.value)}
              onFocus={selectOnFocus ? (event) => event.currentTarget.select() : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              placeholder={placeholder}
              type="text"
              value={value}
            />
          </label>
        </div>

        <div className="workspace-create-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-button" onClick={() => void onSubmit()} type="button">
            {submitLabel}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
}