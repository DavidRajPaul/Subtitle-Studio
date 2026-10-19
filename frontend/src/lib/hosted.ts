/**
 * "Hosted test" means the app is opened through a GitHub Codespaces link rather than on the
 * person's own computer. Then files are processed on that cloud machine, so the interface must
 * not claim they stay on the device.
 */
export function isHostedTest(hostname: string = window.location.hostname): boolean {
  return hostname.toLowerCase().endsWith(".app.github.dev");
}

export const HOSTED_NOTICE_BODY =
  "Files you add are processed on a temporary cloud computer used for this test, and projects " +
  "here can be seen by anyone with this link. Use short, non-sensitive clips.";
