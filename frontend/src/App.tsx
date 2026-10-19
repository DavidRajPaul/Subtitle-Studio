import { useState } from "react";
import { DevicePanel } from "./components/DevicePanel";
import { SpeechModelsPanel } from "./components/SpeechModelsPanel";
import type { LoadedProject } from "./api/projects";
import { EasyFlow } from "./screens/EasyFlow";
import { EasyHome } from "./screens/EasyHome";
import { EasyProjectScreen } from "./screens/EasyProjectScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { getMode, setMode as storeMode, type AppMode } from "./lib/prefs";
import { HomeScreen } from "./screens/HomeScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { isHostedTest } from "./lib/hosted";
import type { Workflow } from "./types";

type View =
  | { name: "home" }
  | { name: "import"; workflow: Workflow }
  | { name: "editor"; projectId: string; initial: LoadedProject | null }
  | { name: "diagnostics" }
  | { name: "easy-new" }
  | { name: "easy-project"; projectId: string; initial: LoadedProject | null; fresh: boolean };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [mode, setModeState] = useState<AppMode>(getMode);
  const goHome = () => {
    setView({ name: "home" });
  };
  const openInEditor = (projectId: string) => {
    storeMode("editor");
    setModeState("editor");
    setView({ name: "editor", projectId, initial: null });
  };
  /** Switching mode keeps an open project open, in the other mode. */
  const switchMode = (next: AppMode) => {
    if (next === mode) return;
    storeMode(next);
    setModeState(next);
    if (next === "editor" && view.name === "easy-project") setView({ name: "editor", projectId: view.projectId, initial: null });
    else if (next === "easy" && view.name === "editor") setView({ name: "easy-project", projectId: view.projectId, initial: null, fresh: false });
    else if (view.name !== "diagnostics") setView({ name: "home" });
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button type="button" className="top-bar__brand link-button" onClick={goHome}>
          Subtitle Studio
        </button>
        <span className="top-bar__mode">{isHostedTest() ? "Hosted test" : "Local processing"}</span>
        <div className="mode-switch" role="group" aria-label="Mode">
          {(["easy", "editor"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="mode-switch__button"
              aria-pressed={mode === m}
              onClick={() => {
                switchMode(m);
              }}
            >
              {m === "easy" ? "Easy" : "Editor"}
            </button>
          ))}
        </div>
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
        {view.name === "home" && mode === "easy" && (
          <EasyHome
            onStart={() => {
              setView({ name: "easy-new" });
            }}
            onOpen={(projectId) => {
              setView({ name: "easy-project", projectId, initial: null, fresh: false });
            }}
          />
        )}
        {view.name === "easy-new" && (
          <EasyFlow
            onBack={goHome}
            onCreated={(initial) => {
              setView({ name: "easy-project", projectId: initial.id, initial, fresh: true });
            }}
          />
        )}
        {view.name === "easy-project" && (
          <EasyProjectScreen
            projectId={view.projectId}
            initial={view.initial}
            fresh={view.fresh}
            onDone={goHome}
            onOpenInEditor={openInEditor}
          />
        )}
        {view.name === "home" && mode === "editor" && (
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
            <h1>Settings</h1>
            <DevicePanel />
            <SpeechModelsPanel />
            <button type="button" className="button button--secondary spaced" onClick={goHome}>
              ← Back to home
            </button>
          </>
        )}
      </main>
    </div>
  );
}
