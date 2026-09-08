#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT=5173
PID_FILE="$REPO_ROOT/.dev.pid"

STOPPED=false

# 1. Stop by PID file if present
if [ -f "$PID_FILE" ]; then
  DEV_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$DEV_PID" ]; then
    if kill -0 "$DEV_PID" 2>/dev/null; then
      echo "⏳ Stopping GH Store dev server (PID: $DEV_PID)..."
      kill "$DEV_PID" 2>/dev/null || true

      # Wait up to 5 seconds for graceful shutdown
      for i in $(seq 1 10); do
        if ! kill -0 "$DEV_PID" 2>/dev/null; then
          break
        fi
        sleep 0.5
      done

      # Force kill if still lingering
      if kill -0 "$DEV_PID" 2>/dev/null; then
        kill -9 "$DEV_PID" 2>/dev/null || true
      fi
      STOPPED=true
    fi
  fi
  rm -f "$PID_FILE"
fi

# 2. Check and clean up any lingering process on port 5173
PORT_PIDS="$(lsof -ti :$PORT 2>/dev/null || fuser "$PORT/tcp" 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  for pid in $PORT_PIDS; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "🛑 Freeing port $PORT (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      STOPPED=true
    fi
  done
fi

# 3. Terminate any orphaned react-router dev runners in this repository
REPO_DEV_PIDS="$(pgrep -f "react-router dev" 2>/dev/null || true)"
if [ -n "$REPO_DEV_PIDS" ]; then
  for pid in $REPO_DEV_PIDS; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      STOPPED=true
    fi
  done
fi

if [ "$STOPPED" = true ]; then
  echo "✅ GH Store dev server has been turned off."
else
  echo "⚡ GH Store dev server was not running."
fi
