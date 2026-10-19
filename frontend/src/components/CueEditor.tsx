import { useId, useState } from "react";
import type { ProjectCue } from "../api/projects";
import type { TimingMode } from "../api/subtitles";
import { MIN_DURATION_MS } from "../lib/cueEdit";
import { parseTimecode } from "../lib/timecode";
import { ConfirmDialog } from "./ConfirmDialog";
import { TimeField } from "./TimeField";

export type TimingEdit = "start" | "end" | "duration";
export type BulkScope = "selected" | "all" | "range";

interface Props {
  cue: ProjectCue | null;
  number: number;
  cueCount: number;
  warnings: string[];
  sequential: boolean;
  onSequentialChange: (sequential: boolean) => void;
  onText: (id: string, text: string) => void;
  /** Returns an explanation if the edit was refused, or null when applied. */
  onTiming: (kind: TimingEdit, ms: number) => string | null;
  onBulk: (scope: BulkScope, from: number, to: number, durationMs: number) => string | null;
  onDelete: () => void;
  currentMode: TimingMode;
  /** Subtitles were timed from speech recognition: regenerating loses the match to the voice. */
  fromSpeech?: boolean;
  onRegenerate: (mode: Exclude<TimingMode, "manual">) => Promise<string | null>;
}

const REGEN_MODES: { value: Exclude<TimingMode, "manual">; title: string; help: string }[] = [
  { value: "equal", title: "Equal distribution", help: "Every subtitle gets the same duration and together they fill the video." },
  { value: "readable", title: "Readable duration", help: "Longer text stays longer. Unused video time stays blank." },
  { value: "fit", title: "Fit to video", help: "Spread subtitles across the whole video where possible." },
];

export function CueEditor({
  cue,
  number,
  cueCount,
  warnings,
  sequential,
  onSequentialChange,
  onText,
  onTiming,
  onBulk,
  onDelete,
  currentMode,
  fromSpeech = false,
  onRegenerate,
}: Props) {
  const id = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMode, setRegenMode] = useState<Exclude<TimingMode, "manual">>(
    currentMode === "manual" ? "readable" : currentMode,
  );
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [scope, setScope] = useState<BulkScope>("selected");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(cueCount));
  const [bulkDuration, setBulkDuration] = useState("3");
  const [bulkMessage, setBulkMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const applyBulk = () => {
    const parsed = parseTimecode(bulkDuration);
    if (!parsed.ok) {
      setBulkMessage({ ok: false, text: parsed.error });
      return;
    }
    if (parsed.ms < MIN_DURATION_MS) {
      setBulkMessage({ ok: false, text: "A subtitle must last longer than zero." });
      return;
    }
    const a = scope === "range" ? Number(from) : 1;
    const b = scope === "range" ? Number(to) : cueCount;
    if (scope === "range" && (!Number.isInteger(a) || !Number.isInteger(b))) {
      setBulkMessage({ ok: false, text: "Enter whole subtitle numbers for the range." });
      return;
    }
    const error = onBulk(scope, a, b, parsed.ms);
    const count = scope === "selected" ? 1 : scope === "all" ? cueCount : b - a + 1;
    setBulkMessage(
      error
        ? { ok: false, text: error }
        : { ok: true, text: `Applied to ${String(count)} ${count === 1 ? "subtitle" : "subtitles"}.` },
    );
  };

  const regenerate = async () => {
    setRegenBusy(true);
    setRegenError(null);
    const error = await onRegenerate(regenMode);
    setRegenBusy(false);
    if (error) setRegenError(error);
    else setRegenOpen(false);
  };

  return (
    <div className="inspector">
      {!cue ? (
        <p className="muted">Select a subtitle in the list or on the timeline to edit it.</p>
      ) : (
        <>
          <h3>Subtitle {number}</h3>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-text`}>
              Text
            </label>
            <textarea
              id={`${id}-text`}
              className="text-input text-input--area"
              data-autofocus
              rows={3}
              value={cue.text}
              onChange={(e) => {
                onText(cue.id, e.currentTarget.value);
              }}
            />
            <span className="field__hint">Line breaks are kept exactly as typed.</span>
          </div>

          {warnings.map((message) => (
            <p key={message} className="warning">
              <span aria-hidden="true">⚠ </span>
              <strong>Warning:</strong> {message}
            </p>
          ))}

          <div className="time-grid">
            <TimeField
              label="Start"
              valueMs={cue.start_ms}
              onCommit={(ms) => onTiming("start", ms)}
              hint="Keeps the duration"
            />
            <TimeField
              label="End"
              valueMs={cue.end_ms}
              onCommit={(ms) => onTiming("end", ms)}
              hint="Recalculates the duration"
            />
            <TimeField
              label="Duration"
              valueMs={cue.end_ms - cue.start_ms}
              onCommit={(ms) => onTiming("duration", ms)}
              hint="Keeps the start"
            />
          </div>
          <p className="field__hint">Type HH:MM:SS.mmm, MM:SS or seconds, then press Enter.</p>

          <fieldset className="choice-group choice-group--tight">
            <legend>When timing changes</legend>
            <label className="choice">
              <input
                type="radio"
                name={`${id}-placement`}
                checked={!sequential}
                onChange={() => {
                  onSequentialChange(false);
                }}
              />
              <span>
                <strong>Independent</strong>
                <span className="choice__help">Only this subtitle changes.</span>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name={`${id}-placement`}
                checked={sequential}
                onChange={() => {
                  onSequentialChange(true);
                }}
              />
              <span>
                <strong>Sequential</strong>
                <span className="choice__help">
                  The subtitles below it in the list move by the same amount.
                </span>
              </span>
            </label>
          </fieldset>

          <details className="inspector__more">
            <summary className="summary-button">Apply one duration to many subtitles</summary>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-scope`}>
                Apply to
              </label>
              <select
                id={`${id}-scope`}
                className="text-input"
                value={scope}
                onChange={(e) => {
                  setScope(e.currentTarget.value as BulkScope);
                  setBulkMessage(null);
                }}
              >
                <option value="selected">This subtitle</option>
                <option value="all">All subtitles</option>
                <option value="range">A range of subtitles</option>
              </select>
            </div>
            {scope === "range" && (
              <div className="time-grid">
                <div className="field">
                  <label className="field__label" htmlFor={`${id}-from`}>
                    From subtitle
                  </label>
                  <input
                    id={`${id}-from`}
                    className="text-input"
                    inputMode="numeric"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.currentTarget.value);
                    }}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`${id}-to`}>
                    To subtitle
                  </label>
                  <input
                    id={`${id}-to`}
                    className="text-input"
                    inputMode="numeric"
                    value={to}
                    onChange={(e) => {
                      setTo(e.currentTarget.value);
                    }}
                  />
                </div>
              </div>
            )}
            <div className="field">
              <label className="field__label" htmlFor={`${id}-bulk`}>
                Duration for each (seconds)
              </label>
              <input
                id={`${id}-bulk`}
                className="text-input"
                inputMode="decimal"
                value={bulkDuration}
                onChange={(e) => {
                  setBulkDuration(e.currentTarget.value);
                }}
              />
              <span className="field__hint">
                Each start time stays put; with Sequential, later subtitles shift so they don't
                overlap.
              </span>
            </div>
            <button type="button" className="button" onClick={applyBulk}>
              Apply duration
            </button>
            {bulkMessage && (
              <p
                role={bulkMessage.ok ? "status" : "alert"}
                className={bulkMessage.ok ? "status--ok" : "inline-error"}
              >
                {bulkMessage.text}
              </p>
            )}
          </details>

          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            Delete this subtitle
          </button>
        </>
      )}

      <hr className="inspector__rule" />
      <h3>Timing for all subtitles</h3>
      <p className="muted">
        Regenerate replaces every subtitle's start and end using a timing mode. Text is kept.
      </p>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          setRegenError(null);
          setRegenOpen(true);
        }}
        disabled={cueCount === 0}
      >
        Regenerate timing…
      </button>

      {confirmDelete && cue && (
        <ConfirmDialog
          title="Delete this subtitle?"
          confirmLabel="Delete"
          destructive
          onCancel={() => {
            setConfirmDelete(false);
          }}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete();
          }}
        >
          <p>Subtitle {number} will be removed from this project. There is no undo yet.</p>
        </ConfirmDialog>
      )}

      {regenOpen && (
        <ConfirmDialog
          title="Replace the timing of all subtitles?"
          confirmLabel="Replace timing"
          destructive
          busy={regenBusy}
          error={regenError}
          onCancel={() => {
            setRegenOpen(false);
          }}
          onConfirm={() => {
            void regenerate();
          }}
        >
          <p>
            This sets a new start and end for all {cueCount} subtitles.{" "}
            <strong>Any timing you set by hand will be lost.</strong>
            {fromSpeech && (
              <>
                {" "}
                <strong>
                  These subtitles were timed from the speech; new timing will not follow the voice.
                </strong>
              </>
            )} Your text and style are not
            changed, and there is no undo yet.
          </p>
          <fieldset className="choice-group choice-group--tight">
            <legend>Timing mode</legend>
            {REGEN_MODES.map((option) => (
              <label key={option.value} className="choice">
                <input
                  type="radio"
                  name={`${id}-regen`}
                  checked={regenMode === option.value}
                  onChange={() => {
                    setRegenMode(option.value);
                  }}
                />
                <span>
                  <strong>{option.title}</strong>
                  <span className="choice__help">{option.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </ConfirmDialog>
      )}
    </div>
  );
}
