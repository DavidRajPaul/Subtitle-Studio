/** What the app is built with, and where to read every licence. */
export function AboutPanel() {
  const base = import.meta.env.BASE_URL;
  return (
    <section className="panel" aria-labelledby="about-heading">
      <h2 id="about-heading">About and licences</h2>
      <p>
        Your videos, words and projects stay on this device. The only
        downloads are the app itself and, if you choose, a speech model from Hugging Face.
      </p>
      <ul className="link-list">
        <li>
          <a className="button button--secondary" href={`${base}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noopener">
            Free software used by the app (licences)
          </a>
        </li>
        <li>
          <a
            className="button button--secondary"
            href="https://github.com/DavidRajPaul/Subtitle-Studio/blob/main/docs/FONTS.md"
            target="_blank"
            rel="noopener"
          >
            Fonts and their licences
          </a>
        </li>
      </ul>
      <p className="muted">Speech models: OpenAI Whisper (MIT licence), converted by Xenova.</p>
    </section>
  );
}
