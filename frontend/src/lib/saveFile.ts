/** Hands a finished file to the person: Share on phones (to Photos, Files, WhatsApp…) or a download. */

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareFile(file: File): Promise<"shared" | "cancelled"> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** A safe file name from a project name, never the original file's name. */
export function exportName(projectName: string, ext: string): string {
  const base = projectName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "subtitles";
  return `${base} - subtitles.${ext}`;
}
