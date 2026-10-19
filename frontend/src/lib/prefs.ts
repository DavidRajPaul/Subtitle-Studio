/** Small per-browser conveniences (remembered choices). Safe when storage is unavailable. */
import { DEFAULT_LOOK, LOOKS } from "../engine/looks";

export type AppMode = "easy" | "editor";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A convenience only.
  }
}

/** Easy mode unless the person has chosen Editor mode themselves. */
export const getMode = (): AppMode => (read("subtitle-studio.mode") === "editor" ? "editor" : "easy");
export const setMode = (mode: AppMode) => {
  write("subtitle-studio.mode", mode);
};

/** New Easy projects start with the look chosen last time. */
export const lastLook = () => LOOKS.find((l) => l.id === read("subtitle-studio.look")) ?? DEFAULT_LOOK;
export const rememberLook = (id: string) => {
  write("subtitle-studio.look", id);
};

export const getLanguage = () => read("subtitle-studio.speech.language") ?? "ta";
export const setLanguage = (code: string) => {
  write("subtitle-studio.speech.language", code);
};
