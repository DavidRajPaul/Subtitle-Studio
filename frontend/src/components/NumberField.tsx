import { useEffect, useId, useState } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** Whole-number input that only applies valid values and explains the allowed range. */
export function NumberField({ label, value, min, max, unit, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(String(value));
    setError(null);
  }, [value]);

  const range = `${String(min)} to ${String(max)}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ""}
      </label>
      <input
        id={id}
        className="text-input"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          const n = Number(next);
          if (next.trim() === "" || !/^-?\d+$/.test(next.trim()) || n < min || n > max) {
            setError(`Enter a whole number from ${range}.`);
            return;
          }
          setError(null);
          onChange(n);
        }}
        onBlur={() => {
          if (error) {
            setText(String(value));
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
