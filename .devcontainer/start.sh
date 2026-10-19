#!/usr/bin/env bash
# Starts the backend (127.0.0.1 only) and the web UI. Runs every time the Codespace starts or resumes.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"

LOG_DIR="${TMPDIR:-/tmp}/subtitle-studio-logs"
mkdir -p "$LOG_DIR"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

if ! port_open 8000; then
  # The backend is never exposed: only the web UI's /api proxy talks to it.
  nohup uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000 \
    >"$LOG_DIR/backend.log" 2>&1 &
fi

if ! port_open 5173; then
  # Codespaces forwards this port; inside the container it must accept the forwarder's connection.
  (cd frontend && SUBTITLE_STUDIO_FRONTEND_HOST=0.0.0.0 nohup pnpm exec vite \
    >"$LOG_DIR/frontend.log" 2>&1 &)
fi

echo "Subtitle Studio is starting. Logs: $LOG_DIR"
