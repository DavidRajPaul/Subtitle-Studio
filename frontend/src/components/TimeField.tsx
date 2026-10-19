import { useEffect, useId, useState } from "react";
import { formatTimecode, parseTimecode } from "../lib/timecode";

interface Props {
  label: string;
  valueMs: number;
  /** Return an explanation if the edit is not allowed, or null when it was applied. */
  onCommit: (ms: number) => string | null;
  hint?: string;
  disabled?: boolean;
}

/** Numeric time input (HH:MM:SS.mmm, MM:SS or seconds). Commits on Enter or when leaving. */
export function TimeField({ label, valueMs, onCommit, hint, disabled = false }: Props) {
  const id = useId();
  const [text, setText] = useState(formatTimecode(valueMs));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatTimecode(valueMs));
    setError(null);
  }, [valueMs]);

  const commit = () => {
    const parsed = parseTimecode(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.ms === valueMs) {
      setText(formatTimecode(valueMs));
      setError(null);
      return;
    }
    setError(onCommit(parsed.ms));
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <input
        id={id}
        className="text-input"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${hint ? `${id}-hint ` : ""}${error ? `${id}-err` : ""}`.trim() || undefined}
        onChange={(e) => {
          setText(e.currentTarget.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setText(formatTimecode(valueMs));
            setError(null);
          }
        }}
      />
      {error && (
        <p className="inline-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
