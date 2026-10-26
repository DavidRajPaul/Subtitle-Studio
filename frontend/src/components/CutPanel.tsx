import { useId, useState, type FormEvent } from "react";
import type { ProjectCue } from "../api/projects";
import {
  cutDuration,
  isUncut,
  mergeTouching,
  MIN_PART_MS,
  partAt,
  partLength,
  partStarts,
  removedParts,
  removeTime,
  restorePart,
  splitAt,
  trimTo,
  type CutResult,
  type Range,
} from "../lib/cuts";
import { formatTimecode, parseTimecode } from "../lib/timecode";

export interface CutChange {
  parts: Range[];
  cues: ProjectCue[];
}

interface Props {
  /** Kept parts of the original, in order. */
  parts: Range[];
  /** Length of the original video. */
  originalMs: number;
  cues: ProjectCue[];
  /** Playhead on the cut timeline. */
  currentMs: number;
  onChange: (next: CutChange) => void;
  onSeek: (ms: number) => void;
  /** Easy mode: only trimming the start and end, and putting cut parts back. */
  simple?: boolean;
}

const t = formatTimecode;
const quote = (text: string) => `“${text.length > 40 ? `${text.slice(0, 39)}…` : text}”`;

/**
 * Cutting the video: trim, split, delete parts, and put deleted parts back. The original file is
 * never changed. If a cut would remove subtitles, it asks first and says which.
 */
export function CutPanel({ parts, originalMs, cues, currentMs, onChange, onSeek, simple = false }: Props) {
  const id = useId();
  const total = cutDuration(parts);
  const [pending, setPending] = useState<{ what: string; result: CutResult } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trimError, setTrimError] = useState<string | null>(null);
  const gaps = removedParts(parts, originalMs);
  const here = Math.min(currentMs, total);
  const part = partAt(parts, here);
  const partStart = partStarts(parts)[part];

  const apply = (result: CutResult, what: string) => {
    onChange({ parts: result.parts, cues: result.cues });
    setPending(null);
    const shortened = result.shortened ? ` ${String(result.shortened)} subtitle${result.shortened === 1 ? " was" : "s were"} shortened.` : "";
    setNote({ ok: true, text: `${what}. The video is now ${t(cutDuration(result.parts))} long.${shortened}` });
    onSeek(Math.min(here, Math.max(0, cutDuration(result.parts) - 1)));
  };

  const run = (result: CutResult, what: string) => {
    setNote(null);
    if (result.parts === parts) {
      setNote({ ok: false, text: `Nothing to cut there. At least ${String(MIN_PART_MS / 1000)} s of video must remain.` });
      return;
    }
    if (result.removed.length > 0) setPending({ what, result });
    else apply(result, what);
  };

  const split = () => {
    const next = splitAt(parts, here);
    if (next === parts) {
      setNote({ ok: false, text: "Too close to the start or end of a part to split here. Move the playhead a little." });
      return;
    }
    onChange({ parts: next, cues });
    setNote({ ok: true, text: `Split at ${t(here)}. Now choose “Delete this part” on the part you don't want.` });
  };

  const trim = (e: FormEvent) => {
    e.preventDefault();
    const a = from.trim() === "" ? { ok: true as const, ms: 0 } : parseTimecode(from);
    const b = to.trim() === "" ? { ok: true as const, ms: total } : parseTimecode(to);
    if (!a.ok || !b.ok) {
      setTrimError(!a.ok ? a.error : (b as { error: string }).error);
      return;
    }
    if (b.ms > total) {
      setTrimError(`The end is past the end of the video (${t(total)}).`);
      return;
    }
    if (b.ms - a.ms < MIN_PART_MS) {
      setTrimError("The end must be at least 0.1 s after the start.");
      return;
    }
    setTrimError(null);
    run(trimTo(parts, cues, a.ms, b.ms), `Kept ${t(a.ms)} to ${t(b.ms)}`);
    setFrom("");
    setTo("");
  };

  const putBack = (gap: Range) => {
    const next = restorePart(parts, cues, gap);
    onChange({ parts: mergeTouching(next.parts), cues: next.cues });
    setNote({ ok: true, text: `Put back ${t(gap.start_ms)}–${t(gap.end_ms)} of the original. Subtitles removed with it do not come back.` });
  };

  return (
    <section className="cut-panel" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{simple ? "Trim the video" : "Cut the video"}</h3>
      <p className="field__hint">
        {isUncut(parts, originalMs) ? `The whole video is used (${t(total)}).` : `The cut video is ${t(total)} long (original ${t(originalMs)}).`} Your
        original file is never changed.
      </p>

      <form className="cut-trim" onSubmit={trim} noValidate aria-label="Trim to exact times">
        <div className="cut-trim__row">
          <label className="field" htmlFor={`${id}-from`}>
            <span className="field__label">Keep from</span>
            <input id={`${id}-from`} className="text-input" inputMode="decimal" placeholder={t(0)} value={from} onChange={(e) => { setFrom(e.target.value); setTrimError(null); }} />
          </label>
          <button type="button" className="button button--secondary" onClick={() => { setFrom(t(here)); }}>
            Use playhead
          </button>
        </div>
        <div className="cut-trim__row">
          <label className="field" htmlFor={`${id}-to`}>
            <span className="field__label">Keep until</span>
            <input id={`${id}-to`} className="text-input" inputMode="decimal" placeholder={t(total)} value={to} onChange={(e) => { setTo(e.target.value); setTrimError(null); }} />
          </label>
          <button type="button" className="button button--secondary" onClick={() => { setTo(t(here)); }}>
            Use playhead
          </button>
        </div>
        <p className="field__hint">Type a time such as 00:00:05.200 or 5.2, or move the playhead and tap “Use playhead”. Empty means the start / the end.</p>
        {trimError && (
          <p role="alert" className="inline-error">
            {trimError}
          </p>
        )}
        <button type="submit" className="button">
          Trim
        </button>
      </form>

      {!simple && (
        <div className="cut-actions" role="group" aria-label={`At the playhead (${t(here)})`}>
          <p className="field__hint">At the playhead ({t(here)}):</p>
          <button type="button" className="button button--secondary" onClick={split}>
            Split here
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={parts.length < 2}
            onClick={() => {
              run(removeTime(parts, cues, partStart, partStart + partLength(parts[part])), `Deleted part ${String(part + 1)}`);
            }}
          >
            Delete this part
          </button>
          <button type="button" className="button button--secondary" disabled={here < MIN_PART_MS} onClick={() => { run(removeTime(parts, cues, 0, here), "Deleted everything before the playhead"); }}>
            Delete before here
          </button>
          <button type="button" className="button button--secondary" disabled={total - here < MIN_PART_MS} onClick={() => { run(removeTime(parts, cues, here, total), "Deleted everything after the playhead"); }}>
            Delete after here
          </button>
          {parts.length < 2 && <p className="field__hint">To delete a piece in the middle: split at its start, split at its end, then “Delete this part”.</p>}
        </div>
      )}

      {pending && (
        <div className="cut-confirm" role="alertdialog" aria-labelledby={`${id}-confirm`}>
          <p id={`${id}-confirm`}>
            <strong>
              This also removes {pending.result.removed.length === 1 ? "1 subtitle" : `${String(pending.result.removed.length)} subtitles`}:
            </strong>{" "}
            {pending.result.removed.slice(0, 3).map((c) => quote(c.text)).join(", ")}
            {pending.result.removed.length > 3 ? ` and ${String(pending.result.removed.length - 3)} more` : ""}. Putting the video back later does not bring them back.
          </p>
          <div className="button-row">
            <button type="button" className="button button--danger" onClick={() => { apply(pending.result, pending.what); }}>
              Cut anyway
            </button>
            <button type="button" className="button button--secondary" onClick={() => { setPending(null); }}>
              Keep them
            </button>
          </div>
        </div>
      )}

      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "field__hint cut-note" : "inline-error"}>
          {note.text}
        </p>
      )}

      {!simple && parts.length > 1 && (
        <>
          <h4 className="cut-subhead">Parts in the video</h4>
          <ol className="cut-list">
            {parts.map((p, i) => (
              <li key={`${String(p.start_ms)}-${String(p.end_ms)}`}>
                <button type="button" className="link-button" onClick={() => { onSeek(partStarts(parts)[i]); }}>
                  Part {i + 1}: {t(partStarts(parts)[i])} – {t(partStarts(parts)[i] + partLength(p))}
                </button>{" "}
                <span className="muted">(original {t(p.start_ms)} – {t(p.end_ms)})</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {gaps.length > 0 && (
        <>
          <h4 className="cut-subhead">Cut away</h4>
          <ul className="cut-list">
            {gaps.map((g) => (
              <li key={`${String(g.start_ms)}-${String(g.end_ms)}`} className="cut-gap">
                <span>
                  Original {t(g.start_ms)} – {t(g.end_ms)} ({(partLength(g) / 1000).toFixed(1)} s)
                </span>
                <button type="button" className="button button--secondary" onClick={() => { putBack(g); }} aria-label={`Put back ${t(g.start_ms)} to ${t(g.end_ms)}`}>
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
