import type { Workflow } from "../types";

interface Props {
  onStart: (workflow: Workflow) => void;
}

export function HomeScreen({ onStart }: Props) {
  return (
    <>
      <h1>Create a subtitle project</h1>
      <p className="muted">
        Video, audio and text stay on this device. Nothing is uploaded to the internet.
      </p>
      <div className="workflow-list">
        <article className="workflow-card" aria-labelledby="wf-speech">
          <h2 id="wf-speech">Transcribe speech</h2>
          <p>Create editable subtitles from speech in an MP4 or a separate MP3.</p>
          <button
            type="button"
            className="button"
            aria-describedby="wf-speech"
            onClick={() => {
              onStart("speech");
            }}
          >
            Start
          </button>
        </article>
        <article className="workflow-card" aria-labelledby="wf-text">
          <h2 id="wf-text">Create subtitles from text</h2>
          <p>Turn a TXT script into subtitles for a video, even if it has no voice.</p>
          <button
            type="button"
            className="button"
            aria-describedby="wf-text"
            onClick={() => {
              onStart("text");
            }}
          >
            Start
          </button>
        </article>
      </div>
    </>
  );
}
