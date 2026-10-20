/** Video files the app opens. Browsers decode the picture and sound; this only checks names. */

export const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mkv", "3gp"] as const;
/** Formats people often have that browsers cannot read. */
const UNSUPPORTED = ["avi", "wmv", "flv", "mpg", "mpeg", "vob", "rm", "rmvb", "asf", "mts", "m2ts", "ts"];

/** For file pickers. "video/*" also lets phones offer their photo library. */
export const VIDEO_ACCEPT = `${VIDEO_EXTENSIONS.map((e) => `.${e}`).join(",")},video/*`;

export const VIDEO_FORMATS_LABEL = "MP4, MOV, M4V, WebM, MKV or 3GP";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** null when the file is worth reading, otherwise what to tell the person. */
export function videoNameProblem(file: { name: string; type: string }): string | null {
  const ext = extensionOf(file.name);
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return null;
  if (UNSUPPORTED.includes(ext)) {
    return `${ext.toUpperCase()} videos cannot be opened in a browser. Convert it to MP4 first (for example with your phone's video editor or VLC), then choose it again.`;
  }
  if (file.type.startsWith("video/")) return null; // e.g. a phone file without an extension
  return `Choose a video file (${VIDEO_FORMATS_LABEL}).`;
}

/** The file name without its extension, for project names. */
export function baseName(name: string): string {
  const ext = extensionOf(name);
  return ext ? name.slice(0, -(ext.length + 1)) : name;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
};

/** The file's own type when the device gave one, otherwise one from its extension. */
export function videoMime(file: { name: string; type: string }): string {
  return file.type || MIME[extensionOf(file.name)] || "video/mp4";
}
