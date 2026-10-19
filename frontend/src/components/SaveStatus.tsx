export type SaveState =
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

interface Props {
  state: SaveState;
  onRetry: () => void;
}

/** Always in the same place: Saving…, Saved, or Could not save (with a way to retry). */
export function SaveStatus({ state, onRetry }: Props) {
  return (
    <div className="save-status" role="status" aria-live="polite">
      {state.kind === "saving" && <span>Saving…</span>}
      {state.kind === "saved" && <span className="status--ok">✓ Saved</span>}
      {state.kind === "error" && (
        <>
          <span className="status--error">Could not save</span>
          <button type="button" className="button button--secondary" onClick={onRetry}>
            Retry
          </button>
          <span className="visually-hidden">{state.message}</span>
        </>
      )}
    </div>
  );
}
