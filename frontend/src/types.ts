export type Workflow = "speech" | "text";

export const WORKFLOW_LABELS: Record<Workflow, string> = {
  speech: "Transcribe speech",
  text: "Create subtitles from text",
};
