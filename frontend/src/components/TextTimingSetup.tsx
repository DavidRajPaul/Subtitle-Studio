import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ApiError,
  generateTiming,
  parseText,
  validateTxtFile,
  type ParsedText,
  type Segmentation,
  type TimingMode,
  type TimingResult,
  type TimingSettings,
} from "../api/subtitles";
import { formatTimecode } from "../lib/timecode";
import { DEFAULT_DRAFT, parseSettings, type SettingsDraft } from "../lib/timingSettings";

const SEGMENTATIONS: { value: Segmentation; title: string; help: string }[] = [
  { value: "line", title: "One subtitle per line", help: "Each non-empty line becomes a subtitle (recommended)." },
  { value: "paragraph", title: "One subtitle per paragraph", help: "Paragraphs are separated by blank lines; line breaks inside are kept." },
  { value: "sentence", title: "Split into sentences", help: "Sentences end at . ! ? and similar marks; wrapped lines are joined." },
];

const MODES: { value: TimingMode; title: string; help: string }[] = [
  { value: "equal", title: "Equal distribution", help: "Every subtitle gets the same duration and together they fill the video." },
  { value: "readable", title: "Readable duration", help: "Longer text stays longer. Unused video time stays blank at the end." },
  { value: "fit", title: "Fit to video", help: "Spread subtitles across the whole video, without going past the maximum length where possible." },
  { value: "manual", title: "Manual", help: "You set each subtitle's start and duration." },
];

const PAGE = 200;

type ParseState =
  | { kind: "empty" }
  | { kind: "parsing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; parsed: ParsedText };

type TimingState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; result: TimingResult };

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

function describeResult(result: TimingResult): string {
  const { summary } = result;
  const count = `${String(summary.cue_count)} ${summary.cue_count === 1 ? "subtitle" : "subtitles"}`;
  const range = `from ${formatTimecode(summary.first_start_ms)} to ${formatTimecode(summary.last_end_ms)}`;
  let tail: string;
  if (summary.blank_end_ms > 0) {
    tail = `${formatTimecode(summary.blank_end_ms)} of the video stays blank at the end`;
  } else if (summary.blank_end_ms < 0) {
    tail = `runs ${formatTimecode(-summary.blank_end_ms)} past the end of the video`;
  } else {
    tail = "covers the whole video";
  }
  return `${count} ${range}; ${tail}.`;
}

export interface TextTimingResult {
  cues: TimingResult["cues"];
  mode: TimingMode;
  segmentation: Segmentation;
  settings: TimingSettings;
}

interface Props {
  durationMs: number;
  /** Creates the project and opens the editor. Rejects with an ApiError if saving fails. */
  onOpenEditor: (result: TextTimingResult) => Promise<void>;
}

export function TextTimingSetup({ durationMs, onOpenEditor }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [segmentation, setSegmentation] = useState<Segmentation>("line");
  const [parse, setParse] = useState<ParseState>({ kind: "empty" });
  const [mode, setMode] = useState<TimingMode>("readable");
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const [timing, setTiming] = useState<TimingState>({ kind: "idle" });
  const [showAll, setShowAll] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setParse({ kind: "empty" });
      return;
    }
    const problem = validateTxtFile(file);
    if (problem) {
      setParse({ kind: "error", message: problem });
      return;
    }
    const controller = new AbortController();
    setParse({ kind: "parsing" });
    parseText(file, segmentation, controller.signal)
      .then((parsed) => {
        setParse({ kind: "ready", parsed });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setParse({ kind: "error", message: messageOf(error) });
      });
    return () => {
      controller.abort();
    };
  }, [file, segmentation]);

  const settingsResult = useMemo(() => parseSettings(draft), [draft]);
  const segments = parse.kind === "ready" ? parse.parsed.segments : null;

  useEffect(() => {
    if (!segments || !settingsResult.ok) {
      setTiming({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setTiming({ kind: "loading" });
    const timer = setTimeout(() => {
      generateTiming(
        { segments, mode, duration_ms: durationMs, settings: settingsResult.settings },
        controller.signal,
      )
        .then((result) => {
          setShowAll(false);
          setTiming({ kind: "ready", result });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setTiming({ kind: "error", message: messageOf(error) });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [segments, mode, durationMs, settingsResult]);

  const issuesByCue = useMemo(() => {
    const map = new Map<number, string[]>();
    if (timing.kind === "ready") {
      for (const issue of timing.result.issues) {
        if (issue.cue_number === null) continue;
        map.set(issue.cue_number, [...(map.get(issue.cue_number) ?? []), issue.message]);
      }
    }
    return map;
  }, [timing]);

  const errors = settingsResult.ok ? {} : settingsResult.errors;
  const setField = (field: keyof SettingsDraft) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };
  const fieldProps = (field: keyof SettingsDraft, label: string, hint: string) => (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-${field}`}>
        {label}
      </label>
      <span className="field__hint" id={`${id}-${field}-hint`}>
        {hint}
      </span>
      <input
        id={`${id}-${field}`}
        className="text-input"
        inputMode="decimal"
        autoComplete="off"
        value={draft[field]}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={`${id}-${field}-hint${errors[field] ? ` ${id}-${field}-err` : ""}`}
        onChange={(e) => {
          setField(field)(e.currentTarget.value);
        }}
      />
      {errors[field] && (
        <p className="inline-error" id={`${id}-${field}-err`} role="alert">
          {errors[field]}
        </p>
      )}
    </div>
  );

  const result = timing.kind === "ready" ? timing.result : null;
  const openEditor = () => {
    if (!result || !settingsResult.ok) return;
    setOpening(true);
    setOpenError(null);
    onOpenEditor({
      cues: result.cues,
      mode,
      segmentation,
      settings: settingsResult.settings,
    }).catch((error: unknown) => {
      setOpenError(messageOf(error));
      setOpening(false);
    });
  };
  const globalIssues = result?.issues.filter((i) => i.cue_number === null) ?? [];
  const cueWarnings = result ? result.issues.length - globalIssues.length : 0;
  const shownCues = result ? (showAll ? result.cues : result.cues.slice(0, PAGE)) : [];

  return (
    <>
      <section className="panel" aria-labelledby={`${id}-txt`}>
        <h2 id={`${id}-txt`}>Text file (TXT, required)</h2>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const chosen = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (chosen) setFile(chosen);
          }}
        />
        {!file && (
          <>
            <p className="muted">
              Choose a UTF-8 text file. It is read on this device only.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                inputRef.current?.click();
              }}
            >
              Select TXT
            </button>
          </>
        )}
        {file && (
          <>
            <p className="file-name">{file.name}</p>
            {parse.kind === "parsing" && (
              <p role="status" aria-busy="true">
                Reading the text…
              </p>
            )}
            {parse.kind === "error" && (
              <p role="alert" className="inline-error">
                {parse.message}
              </p>
            )}
            {parse.kind === "ready" && (
              <p role="status">
                Found {parse.parsed.count} {parse.parsed.count === 1 ? "subtitle" : "subtitles"}.
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                className={parse.kind === "error" ? "button" : "button button--secondary"}
                onClick={() => {
                  inputRef.current?.click();
                }}
              >
                {parse.kind === "error" ? "Choose a different file" : "Replace text file"}
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setFile(null);
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </section>

      {file && (
        <fieldset className="panel choice-group">
          <legend>How should the text be split?</legend>
          {SEGMENTATIONS.map((option) => (
            <label key={option.value} className="choice">
              <input
                type="radio"
                name={`${id}-seg`}
                checked={segmentation === option.value}
                onChange={() => {
                  setSegmentation(option.value);
                }}
              />
              <span>
                <strong>{option.title}</strong>
                <span className="choice__help">{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {segments && (
        <>
          <fieldset className="panel choice-group">
            <legend>How should subtitles be timed?</legend>
            {MODES.map((option) => (
              <label key={option.value} className="choice">
                <input
                  type="radio"
                  name={`${id}-mode`}
                  checked={mode === option.value}
                  onChange={() => {
                    setMode(option.value);
                  }}
                />
                <span>
                  <strong>{option.title}</strong>
                  <span className="choice__help">{option.help}</span>
                </span>
              </label>
            ))}
            {mode === "manual" && (
              <p className="muted">
                Manual starts from readable timing so you have something to adjust. You then set
                each subtitle's start and duration in the editor.
              </p>
            )}
          </fieldset>

          <details className="panel">
            <summary className="summary-button">Readability settings</summary>
            <p className="muted">
              Used by Readable duration and Fit to video, and to flag hard-to-read subtitles in
              every mode.
            </p>
            {fieldProps("cps", "Characters per second", "How fast people can comfortably read.")}
            {fieldProps("min", "Minimum duration (seconds)", "Shortest time a subtitle stays up.")}
            {fieldProps("max", "Maximum duration (seconds)", "Longest time a subtitle stays up.")}
            {fieldProps("gap", "Gap between subtitles (seconds)", "Blank time between one and the next.")}
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setDraft(DEFAULT_DRAFT);
              }}
            >
              Reset to defaults
            </button>
          </details>

          <section className="panel" aria-labelledby={`${id}-result`}>
            <h2 id={`${id}-result`}>Result</h2>
            <div aria-live="polite">
              {timing.kind === "loading" && <p aria-busy="true">Working out the timing…</p>}
              {timing.kind === "idle" && !settingsResult.ok && (
                <p className="inline-error">
                  Fix the readability settings above to see the result.
                </p>
              )}
              {timing.kind === "error" && (
                <p role="alert" className="inline-error">
                  {timing.message}
                </p>
              )}
              {result && (
                <>
                  <p>
                    <strong>{describeResult(result)}</strong>
                  </p>
                  {globalIssues.map((issue) => (
                    <p key={issue.code} className="warning">
                      <span aria-hidden="true">⚠ </span>
                      <strong>Warning:</strong> {issue.message}
                    </p>
                  ))}
                  {cueWarnings > 0 && (
                    <p className="warning">
                      <span aria-hidden="true">⚠ </span>
                      <strong>
                        {cueWarnings} {cueWarnings === 1 ? "warning" : "warnings"}
                      </strong>{" "}
                      on individual subtitles below. Nothing was changed automatically.
                    </p>
                  )}
                </>
              )}
            </div>
            {result && (
              <>
                <ol className="cue-list" aria-label="Generated subtitles">
                  {shownCues.map((cue) => (
                    <li key={cue.id} className="cue-row">
                      <div className="cue-row__head">
                        <span className="cue-row__num">{cue.index}</span>
                        <span className="cue-row__time">
                          {formatTimecode(cue.start_ms)} → {formatTimecode(cue.end_ms)} (
                          {((cue.end_ms - cue.start_ms) / 1000).toFixed(1)} s)
                        </span>
                      </div>
                      <p className="cue-row__text">{cue.text}</p>
                      {(issuesByCue.get(cue.index) ?? []).map((message) => (
                        <p key={message} className="warning">
                          <span aria-hidden="true">⚠ </span>
                          <strong>Warning:</strong> {message}
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
                {!showAll && result.cues.length > PAGE && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setShowAll(true);
                    }}
                  >
                    Show all {result.cues.length} subtitles
                  </button>
                )}
                {openError && (
                  <p role="alert" className="inline-error">
                    {openError}
                  </p>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={opening}
                  onClick={openEditor}
                >
                  {opening ? "Creating the project…" : "Open in editor"}
                </button>
                <p className="muted">
                  The editor lets you change text, timing and style. Export arrives in a later
                  phase.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
