import { useId } from "react";
import type { SubtitleStyle } from "../api/projects";
import { FONT_OPTIONS } from "../lib/style";
import { NumberField } from "./NumberField";

interface Props {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

interface SegmentedProps<T extends string> {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ legend, value, options, onChange }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend className="field__label">{legend}</legend>
      <div className="segmented__row">
        {options.map((option) => (
          <label key={option.value} className="segment">
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Global subtitle style. Changes update the preview immediately. */
export function StylePanel({ style, onChange }: Props) {
  const id = useId();
  const set = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
    onChange({ ...style, [key]: value });
  };
  return (
    <div className="inspector">
      <p className="muted">
        Applies to every subtitle. The preview updates as you change values; exported video may
        differ slightly if a font is not available on the computer that renders it.
      </p>

      <fieldset className="style-group">
        <legend>Text</legend>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-font`}>
            Font
          </label>
          <select
            id={`${id}-font`}
            className="text-input"
            value={style.font_family}
            onChange={(e) => {
              set("font_family", e.currentTarget.value);
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label="Size"
          unit="px at 1080p"
          value={style.font_size}
          min={8}
          max={200}
          onChange={(v) => {
            set("font_size", v);
          }}
        />
        <div className="field">
          <label className="field__label" htmlFor={`${id}-color`}>
            Text color
          </label>
          <input
            id={`${id}-color`}
            type="color"
            className="color-input"
            value={style.text_color}
            onChange={(e) => {
              set("text_color", e.currentTarget.value.toUpperCase());
            }}
          />
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary toggle"
            aria-pressed={style.bold}
            onClick={() => {
              set("bold", !style.bold);
            }}
          >
            <strong>Bold</strong>
          </button>
          <button
            type="button"
            className="button button--secondary toggle"
            aria-pressed={style.italic}
            onClick={() => {
              set("italic", !style.italic);
            }}
          >
            <em>Italic</em>
          </button>
        </div>
      </fieldset>

      <fieldset className="style-group">
        <legend>Readability</legend>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-outline`}>
            Outline color
          </label>
          <input
            id={`${id}-outline`}
            type="color"
            className="color-input"
            value={style.outline_color}
            onChange={(e) => {
              set("outline_color", e.currentTarget.value.toUpperCase());
            }}
          />
        </div>
        <NumberField
          label="Outline thickness"
          unit="px"
          value={style.outline_px}
          min={0}
          max={12}
          onChange={(v) => {
            set("outline_px", v);
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={style.shadow}
            onChange={(e) => {
              set("shadow", e.currentTarget.checked);
            }}
          />
          <span>Shadow</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={style.background.enabled}
            onChange={(e) => {
              set("background", { ...style.background, enabled: e.currentTarget.checked });
            }}
          />
          <span>Background box</span>
        </label>
        {style.background.enabled && (
          <>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-bg`}>
                Background color
              </label>
              <input
                id={`${id}-bg`}
                type="color"
                className="color-input"
                value={style.background.color}
                onChange={(e) => {
                  set("background", { ...style.background, color: e.currentTarget.value.toUpperCase() });
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-bgop`}>
                Background opacity: {Math.round(style.background.opacity * 100)}%
              </label>
              <input
                id={`${id}-bgop`}
                type="range"
                className="preview__scrubber"
                min={0}
                max={100}
                value={Math.round(style.background.opacity * 100)}
                onChange={(e) => {
                  set("background", {
                    ...style.background,
                    opacity: Number(e.currentTarget.value) / 100,
                  });
                }}
              />
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="style-group">
        <legend>Placement</legend>
        <Segmented
          legend="Position"
          value={style.position}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
          onChange={(v) => {
            set("position", v);
          }}
        />
        <Segmented
          legend="Alignment"
          value={style.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(v) => {
            set("align", v);
          }}
        />
        <NumberField
          label="Safe margin"
          unit="% of the frame"
          value={style.safe_margin_pct}
          min={0}
          max={25}
          onChange={(v) => {
            set("safe_margin_pct", v);
          }}
        />
        <NumberField
          label="Vertical offset"
          unit="px, positive moves down"
          value={style.vertical_offset_px}
          min={-300}
          max={300}
          onChange={(v) => {
            set("vertical_offset_px", v);
          }}
        />
      </fieldset>
    </div>
  );
}
