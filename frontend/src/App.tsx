import { HealthPanel } from "./components/HealthPanel";

export function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <a className="top-bar__brand" href="/">
          Subtitle Studio
        </a>
        <span className="top-bar__mode">Local processing</span>
      </header>
      <main className="page" id="main">
        <h1>Subtitle Studio</h1>
        <p className="muted">
          Subtitles are created and processed on this device. Your video, audio and text are not
          uploaded.
        </p>
        <HealthPanel />
      </main>
    </div>
  );
}
