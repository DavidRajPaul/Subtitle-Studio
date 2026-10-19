import { useRef, type FocusEvent, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet for phones. Scrolls internally and keeps the focused field visible. */
export function Sheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const keepVisible = (event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    // Give the on-screen keyboard time to open, then bring the field into view.
    setTimeout(() => {
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 300);
  };
  return (
    <div className="sheet-backdrop">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="sheet">
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet__body" onFocusCapture={keepVisible}>
          {children}
        </div>
      </div>
    </div>
  );
}
