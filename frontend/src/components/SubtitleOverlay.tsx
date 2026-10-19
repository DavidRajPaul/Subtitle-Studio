import type { ProjectCue, SubtitleStyle } from "../api/projects";
import { overlayBlockStyle, overlayTextStyle, type StageSize } from "../lib/style";
import { activeCues } from "../lib/timeline";

interface Props {
  cues: ProjectCue[];
  tMs: number;
  style: SubtitleStyle;
  size: StageSize;
}

/** Draws the subtitles active at tMs using the project's one style model. */
export function SubtitleOverlay({ cues, tMs, style, size }: Props) {
  const active = activeCues(cues, tMs).filter((c) => c.text.trim() !== "");
  return (
    <div style={overlayBlockStyle(style, size)} data-testid="subtitle-overlay" aria-hidden="true">
      {active.map((cue) => (
        <div key={cue.id} className="overlay__line">
          <span style={overlayTextStyle(style, size)}>{cue.text}</span>
        </div>
      ))}
    </div>
  );
}
