import { RecentProjects } from "./HomeScreen";

interface Props {
  onStart: () => void;
  onOpen: (projectId: string) => void;
}

export function EasyHome({ onStart, onOpen }: Props) {
  return (
    <>
      <section className="easy-hero" aria-labelledby="easy-title">
        <h1 id="easy-title">Subtitles in three steps</h1>
        <ol className="easy-steps-list">
          <li>Choose your video</li>
          <li>Tell us where the words come from: the voice, typed text, or a TXT file</li>
          <li>Pick a look</li>
        </ol>
        <button type="button" className="button button--big" onClick={onStart}>
          Make subtitles
        </button>
        <p className="muted">
          Everything happens on this device. Nothing is uploaded. Need full control? Switch to
          Editor at the top.
        </p>
      </section>
      <RecentProjects onOpen={onOpen} />
    </>
  );
}
