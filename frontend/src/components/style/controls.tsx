import { useEffect, useId, useState, type ReactNode } from "react";

/** Slider plus an editable number, so every value can be set exactly as well as by dragging. */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(format ? format(value) : String(value));
  useEffect(() => {
    setText(format ? format(value) : String(value));
  }, [value, format]);
  const commit = () => {
    const n = Number.parseFloat(text.replace(",", "."));
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, step >= 1 ? Math.round(n) : n));
      onChange(clamped);
      setText(format ? format(clamped) : String(clamped));
    } else setText(format ? format(value) : String(value));
  };
  return (
    <div className="range-field">
      <div className="range-field__head">
        <label htmlFor={id} className="range-field__label">
          {label}
        </label>
        <span className="range-field__value">
          <input
            className="range-field__number"
            inputMode="decimal"
            aria-label={`${label} value${unit ? ` (${unit})` : ""}`}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
          />
          {unit && <span className="range-field__unit">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="range-field__slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          onChange(Number(e.currentTarget.value));
        }}
      />
    </div>
  );
}

/** One choice out of a few, as large buttons (a radio group underneath). */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend className="field__label">{legend}</legend>
      <div className="segmented__row">
        {options.map((o) => (
          <label key={o.value} className="segment" title={o.title}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A custom colour picker followed by ready-made swatches. */
export function SwatchRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (hex: string) => void;
}) {
  const id = useId();
  return (
    <div className="swatch-row" role="group" aria-label={label}>
      <label className="swatch swatch--custom" htmlFor={id} title="Any colour">
        <span className="visually-hidden">Choose any colour for {label.toLowerCase()}</span>
        <span aria-hidden="true">+</span>
        <input
          id={id}
          type="color"
          className="swatch__input"
          value={value.toLowerCase()}
          onChange={(e) => {
            onChange(e.currentTarget.value.toUpperCase());
          }}
        />
      </label>
      {swatches.map((hex) => (
        <button
          key={hex}
          type="button"
          className="swatch"
          style={{ background: hex }}
          aria-label={hex}
          aria-pressed={value.toUpperCase() === hex}
          onClick={() => {
            onChange(hex);
          }}
        />
      ))}
    </div>
  );
}

/** Big picture tiles (animations), selected one outlined. */
export function OptionTiles<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tiles" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="tile"
          onClick={() => {
            onChange(o.value);
          }}
        >
          <span className="tile__icon" aria-hidden="true">
            {o.icon}
          </span>
          <span className="tile__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Small text tabs inside a panel (In / Out / Loop / Caption …). */
export function SubTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className="subtab"
          onClick={() => {
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
      />
      <span>{label}</span>
    </label>
  );
}
