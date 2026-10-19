import { useState } from "react";
import { HealthPanel } from "./components/HealthPanel";
import type { LoadedProject } from "./api/projects";
import { EditorScreen } from "./screens/EditorScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ImportScreen } from "./screens/ImportScreen";
import type { Workflow } from "./types";

type View =
  | { name: "home" }
  | { name: "import"; workflow: Workflow }
  | { name: "editor"; projectId: string; initial: LoadedProject | null }
  | { name: "diagnostics" };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const goHome = () => {
    setView({ name: "home" });
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button type="button" className="top-bar__brand link-button" onClick={goHome}>
          Subtitle Studio
        </button>
        <span className="top-bar__mode">Local processing</span>
        <button
          type="button"
          className="button button--secondary"
          aria-current={view.name === "diagnostics" ? "page" : undefined}
          onClick={() => {
            setView({ name: "diagnostics" });
          }}
        >
          Settings
        </button>
      </header>
      <main className="page" id="main">
        {view.name === "home" && (
          <HomeScreen
            onStart={(workflow) => {
              setView({ name: "import", workflow });
            }}
            onOpen={(projectId) => {
              setView({ name: "editor", projectId, initial: null });
            }}
          />
        )}
        {view.name === "import" && (
          <ImportScreen
            workflow={view.workflow}
            onChangeWorkflow={(workflow) => {
              setView({ name: "import", workflow });
            }}
            onBack={goHome}
            onOpenProject={(initial) => {
              setView({ name: "editor", projectId: initial.id, initial });
            }}
          />
        )}
        {view.name === "editor" && (
          <EditorScreen projectId={view.projectId} initial={view.initial} onExit={goHome} />
        )}
        {view.name === "diagnostics" && (
          <>
            <h1>Settings and diagnostics</h1>
            <HealthPanel />
            <button type="button" className="button button--secondary spaced" onClick={goHome}>
              ← Back to home
            </button>
          </>
        )}
      </main>
    </div>
  );
}
