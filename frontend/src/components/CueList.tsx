import { memo, useEffect } from "react";
import type { ProjectCue } from "../api/projects";
import { formatTimecode } from "../lib/timecode";

interface RowProps {
  cue: ProjectCue;
  number: number;
  selected: boolean;
  active: boolean;
  warnings: string[];
  onSelect: (id: string) => void;
}

const CueRow = memo(function CueRow({ cue, number, selected, active, warnings, onSelect }: RowProps) {
  return (
    <li>
      <button
        type="button"
        id={`cue-row-${cue.id}`}
        className="cue-row cue-row--button"
        data-selected={selected}
        data-active={active}
        aria-current={active ? "true" : undefined}
        onClick={() => {
          onSelect(cue.id);
        }}
      >
        <span className="cue-row__head">
          <span className="cue-row__num">{number}</span>
          <span className="cue-row__time">
            {formatTimecode(cue.start_ms)} → {formatTimecode(cue.end_ms)}
          </span>
          {active && <span className="badge">Showing now</span>}
          {selected && <span className="badge badge--edit">Editing</span>}
        </span>
        <span className="cue-row__text">{cue.text.trim() === "" ? "(empty subtitle)" : cue.text}</span>
        {warnings.map((message) => (
          <span key={message} className="warning warning--block">
            <span aria-hidden="true">⚠ </span>
            <strong>Warning:</strong> {message}
          </span>
        ))}
      </button>
    </li>
  );
});

interface Props {
  cues: ProjectCue[];
  selectedId: string | null;
  activeIds: ReadonlySet<string>;
  issuesByCue: ReadonlyMap<number, string[]>;
  playing: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

const NO_WARNINGS: string[] = [];

export function CueList({ cues, selectedId, activeIds, issuesByCue, playing, onSelect, onAdd }: Props) {
  const firstActive = cues.find((c) => activeIds.has(c.id))?.id;

  // While playing, keep the subtitle that is on screen visible in the list.
  useEffect(() => {
    if (!playing || !firstActive) return;
    const el = document.getElementById(`cue-row-${firstActive}`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [playing, firstActive]);

  return (
    <section className="panel" aria-labelledby="cue-list-heading">
      <div className="panel__head">
        <h2 id="cue-list-heading">Subtitles ({cues.length})</h2>
        <button type="button" className="button button--secondary" onClick={onAdd}>
          + Add at playhead
        </button>
      </div>
      {cues.length === 0 ? (
        <div className="empty-state">
          <p>
            <strong>No subtitles yet.</strong>
          </p>
          <p className="muted">
            Move the playhead to where a subtitle should start, then add one.
          </p>
          <button type="button" className="button" onClick={onAdd}>
            + Add a subtitle
          </button>
        </div>
      ) : (
        <ol className="cue-list cue-list--scroll" aria-label="Subtitles">
          {cues.map((cue, i) => (
            <CueRow
              key={cue.id}
              cue={cue}
              number={i + 1}
              selected={cue.id === selectedId}
              active={activeIds.has(cue.id)}
              warnings={issuesByCue.get(i + 1) ?? NO_WARNINGS}
              onSelect={onSelect}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
