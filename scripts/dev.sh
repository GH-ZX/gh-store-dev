#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
. "$SCRIPT_DIR/stop.sh"
cd "$REPO_ROOT"

LOG_FILE="$REPO_ROOT/.dev.log"

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to identify this repository's dev server safely." >&2
  exit 1
fi

# Find pnpm binary
if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM_CMD="corepack pnpm"
else
  PNPM_CMD="npx pnpm"
fi

# Check if already running on port 5173
EXISTING_PID="$(saved_dev_pid || true)"
if [ -z "$EXISTING_PID" ] && [ -f "$PID_FILE" ]; then
  rm -f "$PID_FILE"
fi

for pid in $(dev_listener_pids); do
  if is_repo_dev_process "$pid"; then
    EXISTING_PID="$pid"
  else
    echo "Port $PORT is occupied by another process (PID: $pid)." >&2
    exit 1
  fi
done

if [ -n "$EXISTING_PID" ]; then
  echo "⚡ GH Store dev server is already starting or running. (PID: $EXISTING_PID)"
  echo "🌐 Local URL: http://localhost:$PORT"
  echo "🛑 To turn off: ./stop.sh (or pnpm run dev:stop)"
  exit 0
fi

# Check for background flag (-d, --daemon, -b, --background)
DAEMON_MODE=false
for arg in "$@"; do
  case "$arg" in
    -d|--daemon|-b|--background)
      DAEMON_MODE=true
      ;;
  esac
done

echo "🚀 Starting GH Store (React Router on Cloudflare Workers)..."

if [ "$DAEMON_MODE" = true ]; then
  # Run detached in background
  nohup $PNPM_CMD --dir storefront run dev --port "$PORT" --strictPort > "$LOG_FILE" 2>&1 &
  DEV_PID=$!
  { echo "$DEV_PID"; dev_process_started_at "$DEV_PID"; } > "$PID_FILE"

  echo "⏳ Waiting for dev server on http://localhost:$PORT..."
  READY=false
  for i in $(seq 1 30); do
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Dev server exited before becoming ready. Check $LOG_FILE." >&2
      exit 1
    fi
    for pid in $(dev_listener_pids); do
      if is_repo_dev_process "$pid"; then
        READY=true
        break
      fi
    done
    [ "$READY" = true ] && break
    sleep 0.5
  done
  if [ "$READY" != true ]; then
    echo "Dev server is not ready on port $PORT. Check $LOG_FILE or run ./stop.sh." >&2
    exit 1
  fi

  echo ""
  echo "✅ GH Store dev server is running in background!"
  echo "🌐 Local URL:  http://localhost:$PORT"
  echo "🆔 Process ID: $DEV_PID (saved in .dev.pid)"
  echo "📄 Live Logs:  tail -f .dev.log"
  echo "🛑 Turn off:   ./stop.sh"
  exit 0
else
  # Foreground mode: write PID and trap exit to clean up
  trap 'rm -f "$PID_FILE"; echo -e "\n🛑 GH Store dev server stopped."; exit 0' INT TERM EXIT
  { echo "$$"; dev_process_started_at "$$"; } > "$PID_FILE"
  echo "🌐 Dev URL: http://localhost:$PORT (Press Ctrl+C to stop)"
  echo "💡 Tip: To run in background instead, use: ./dev.sh --background"
  echo ""
  exec $PNPM_CMD --dir storefront run dev --port "$PORT" --strictPort
fi
