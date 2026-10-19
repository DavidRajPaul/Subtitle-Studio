#!/usr/bin/env bash
# One-time setup for a Codespace: FFmpeg, uv, pnpm and the project dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends ffmpeg
fi

if ! command -v uv >/dev/null 2>&1; then
  python3 -m pip install --user --quiet uv
fi
export PATH="$HOME/.local/bin:$PATH"

corepack enable || $SUDO corepack enable
(cd frontend && pnpm install --frozen-lockfile)
uv sync --directory backend

echo "Setup finished. The app starts automatically; see docs/HOSTED_TEST.md."
