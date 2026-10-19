# Hosted test with GitHub Codespaces

Subtitle Studio needs Python and FFmpeg, so it cannot run on GitHub Pages (static files only). The GitHub-only way to let someone try it from a link is a **GitHub Codespace**: a small temporary computer that GitHub runs for you. The repository's `.devcontainer/` folder installs everything and starts the app automatically.

> **Privacy:** in a hosted test, files a tester adds are processed on that Codespace (a computer in GitHub's cloud), not on the tester's device. The app says so on its home page. Projects are shared by everyone who has the link (there are no accounts). Ask testers to use short, non-sensitive clips. Deleting the Codespace deletes everything in it. Normal local use is unchanged: nothing leaves your computer.

## For the owner: start it and share the link (works from a phone browser)

1. Open **https://codespaces.new/DavidRajPaul/Subtitle-Studio**, choose the default branch `main` and a **2-core** machine, then **Create codespace**. The first start takes a few minutes (it installs FFmpeg and the dependencies).
2. When the editor view appears, wait about a minute, then open the **Ports** tab. The row **Subtitle Studio (5173)** should be listed.
3. Set its visibility to **Public** (long-press or right-click the row → *Port Visibility* → *Public*). Until you do, only you can open the link.
4. Copy the address of that row (it looks like `https://<name>-5173.app.github.dev`) and send it to your tester.
5. Open the address yourself first: you should see **Hosted test** in the top bar and the hosted-test notice.

Good to know:
- A Codespace **stops after about 30 minutes of inactivity**. Reopen it from https://github.com/codespaces; the app restarts by itself and the address stays the same. Check the port is still **Public** after a restart.
- Personal GitHub accounts get a limited free monthly Codespaces allowance; check your billing page. A 2-core machine uses it more slowly.
- GitHub shows testers a one-time page ("you are about to access a development port…") with a **Continue** button the first time they open a public port.
- When testing is over, **delete the Codespace** at https://github.com/codespaces and set nothing else public.
- If the app does not load, open the Codespace terminal and run `bash .devcontainer/start.sh`, then reload.

## For the tester (message you can forward)

> Hi! This is an early test of Subtitle Studio, a tool that turns a script into timed subtitles for a video. Open **<the link>** (press *Continue* if GitHub shows a warning page). Please use a **short MP4 clip (under 50 MB, ideally under a minute)** and a **plain-text script saved as UTF-8**, and nothing private: the files are processed on a temporary cloud computer, and other testers using the same link could see your project.
>
> Try this: **Create subtitles from text** → choose the MP4 and the TXT → **Open in editor**. Tap a subtitle, change its Start time by typing, change the style, drag a block on the timeline, then go back to **Projects** and reopen it. Tell me anything that was confusing, slow, hard to tap, or looked wrong (a screenshot helps), and which phone/browser you used.

## What this does not verify

I could test the setup scripts, the host check and the hosted wording on a normal machine, but **I have not run it inside a real Codespace**. Unverified until you try it: the container build (FFmpeg install, dependency install), GitHub's port forwarding and Public visibility, and large uploads through GitHub's proxy. If a step fails, send me the message it shows.

## How it works (for maintainers)

- `.devcontainer/devcontainer.json`: Python 3.12 image + Node 22; runs `setup.sh` once (FFmpeg, uv, pnpm, dependencies) and `start.sh` on every start; forwards only port 5173.
- `start.sh`: backend on `127.0.0.1:8000` (never exposed); web UI on 5173 with the `/api` proxy. Inside the container the UI listens on all interfaces only so GitHub's forwarder can reach it; hot reload is off there.
- `frontend/vite.config.ts`: `allowedHosts: [".app.github.dev"]` (other hostnames are rejected).
- `frontend/src/lib/hosted.ts`: the UI switches its privacy wording when opened on `*.app.github.dev`.
