import { useRef, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";

interface Props {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  error = null,
  destructive = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onCancel);
  return (
    <div className="dialog-backdrop">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="dialog">
        <h2>{title}</h2>
        <div className="dialog__body">{children}</div>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary"
            data-autofocus
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "button button--danger" : "button"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
