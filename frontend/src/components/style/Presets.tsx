import { useId, useState, type FormEvent } from "react";
import {
  deletePreset,
  findPreset,
  MAX_PRESET_NAME,
  presetNameProblem,
  renamePreset,
  sameStyle,
  savePreset,
  suggestName,
  updatePresetStyle,
  type Preset,
} from "../../api/presets";
import type { SubtitleStyle } from "../../api/projects";
import { usePresets } from "../../hooks/usePresets";
import { rememberPreset } from "../../lib/prefs";
import { LookThumb } from "./LookThumb";

interface Props {
  style: SubtitleStyle;
  onChange: (next: SubtitleStyle) => void;
}

const failed = (e: unknown) => (e instanceof Error && e.message ? e.message : "Could not save on this device. Free some space and try again.");

/** "Save as preset" whenever the current style is not saved yet; "✓ Preset: name" when it is. */
export function SavePresetBar({ style }: { style: SubtitleStyle }) {
  const { presets } = usePresets();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  if (presets === null) return null;
  const match = findPreset(presets, style);
  if (match && !naming) {
    return (
      <p className="preset-bar preset-bar--saved" role="status">
        ✓ Preset: <strong>{match.name}</strong>
      </p>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = presetNameProblem(name, presets);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    savePreset(name, style).then(
      () => {
        setBusy(false);
        setNaming(false);
        setError(null);
      },
      (err: unknown) => {
        setBusy(false);
        setError(failed(err));
      },
    );
  };
  if (!naming) {
    return (
      <div className="preset-bar">
        <p>This style is not a preset yet. Save it to use it on other videos.</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setName(suggestName(presets));
            setError(null);
            setNaming(true);
          }}
        >
          Save as preset
        </button>
      </div>
    );
  }
  return (
    <form className="preset-bar preset-form" onSubmit={submit} aria-label="Save as preset">
      <label htmlFor={`${id}-name`}>Preset name</label>
      <input
        id={`${id}-name`}
        className="text-input"
        value={name}
        maxLength={MAX_PRESET_NAME + 10}
        autoFocus
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : "Save preset"}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setNaming(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ManagePreset({ preset, presets, style, onClose }: { preset: Preset; presets: Preset[]; style: SubtitleStyle; onClose: () => void }) {
  const [name, setName] = useState(preset.name);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = useId();
  const run = (p: Promise<unknown>, ok: string) => {
    p.then(
      () => {
        setNote({ ok: true, text: ok });
      },
      (e: unknown) => {
        setNote({ ok: false, text: failed(e) });
      },
    );
  };
  return (
    <section className="preset-manage" aria-label={`Preset “${preset.name}”`}>
      <form
        className="preset-form"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = presetNameProblem(name, presets, preset.id);
          if (problem) setNote({ ok: false, text: problem });
          else run(renamePreset(preset.id, name), "Renamed.");
        }}
      >
        <label htmlFor={`${id}-rename`}>Name</label>
        <input
          id={`${id}-rename`}
          className="text-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNote(null);
          }}
        />
        <button type="submit" className="button button--secondary" disabled={name.trim() === preset.name}>
          Rename
        </button>
      </form>
      <button
        type="button"
        className="button button--secondary"
        disabled={sameStyle(preset.style, style)}
        onClick={() => {
          run(updatePresetStyle(preset.id, style), `“${preset.name}” now uses the current style.`);
        }}
      >
        Replace with the current style
      </button>
      {confirmDelete ? (
        <div className="preset-confirm" role="group" aria-label="Confirm delete">
          <p>Delete “{preset.name}”? Videos that already use this style keep it.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                deletePreset(preset.id).then(onClose, (e: unknown) => {
                  setNote({ ok: false, text: failed(e) });
                });
              }}
            >
              Delete preset
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setConfirmDelete(false);
              }}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          Delete…
        </button>
      )}
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "field__hint" : "inline-error"}>
          {note.text}
        </p>
      )}
      <button type="button" className="button button--secondary" onClick={onClose}>
        Close
      </button>
    </section>
  );
}

/** "My presets": tap one to apply it to this video. */
export function PresetList({ style, onChange }: Props) {
  const { presets, error } = usePresets();
  const [managing, setManaging] = useState<string | null>(null);
  if (error) return <p className="inline-error">Presets could not be loaded in this browser.</p>;
  if (presets === null) return null;
  const managed = presets.find((p) => p.id === managing);
  return (
    <section className="presets" aria-labelledby="presets-heading">
      <h3 id="presets-heading" className="presets__title">
        My presets
      </h3>
      {presets.length === 0 ? (
        <p className="field__hint">No presets yet. Style a subtitle the way you like, then tap Save as preset.</p>
      ) : (
        <div className="looks" role="radiogroup" aria-label="My presets">
          {presets.map((p) => (
            <div key={p.id} className="preset-tile">
              <button
                type="button"
                role="radio"
                aria-checked={sameStyle(p.style, style)}
                className="look"
                onClick={() => {
                  onChange(structuredClone(p.style));
                  rememberPreset(p.id);
                }}
              >
                <LookThumb style={p.style} />
                <span className="look__name preset-tile__name">{p.name}</span>
              </button>
              <button
                type="button"
                className="preset-tile__more"
                aria-label={`Options for ${p.name}`}
                aria-expanded={managing === p.id}
                onClick={() => {
                  setManaging(managing === p.id ? null : p.id);
                }}
              >
                ⋯
              </button>
            </div>
          ))}
        </div>
      )}
      {managed && (
        <ManagePreset
          key={managed.id}
          preset={managed}
          presets={presets}
          style={style}
          onClose={() => {
            setManaging(null);
          }}
        />
      )}
    </section>
  );
}
