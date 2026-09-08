#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PORT=5173
PID_FILE="$REPO_ROOT/.dev.pid"
LOG_FILE="$REPO_ROOT/.dev.log"

# Find pnpm binary
if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM_CMD="corepack pnpm"
else
  PNPM_CMD="npx pnpm"
fi

# Check if already running on port 5173
EXISTING_PID=""
if [ -f "$PID_FILE" ]; then
  SAVED_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$SAVED_PID" ] && kill -0 "$SAVED_PID" 2>/dev/null; then
    EXISTING_PID="$SAVED_PID"
  fi
fi

if [ -z "$EXISTING_PID" ]; then
  OCCUPIED="$(lsof -ti :$PORT 2>/dev/null || fuser "$PORT/tcp" 2>/dev/null || true)"
  if [ -n "$OCCUPIED" ]; then
    EXISTING_PID="$(echo "$OCCUPIED" | head -n1)"
  fi
fi

if [ -n "$EXISTING_PID" ]; then
  echo "⚡ GH Store dev server is already running! (PID: $EXISTING_PID)"
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
  nohup $PNPM_CMD --dir storefront run dev > "$LOG_FILE" 2>&1 &
  DEV_PID=$!
  echo "$DEV_PID" > "$PID_FILE"

  echo "⏳ Waiting for dev server on http://localhost:$PORT..."
  for i in $(seq 1 30); do
    if lsof -i :$PORT >/dev/null 2>&1 || curl -s "http://localhost:$PORT" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

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
  echo "$$" > "$PID_FILE"
  echo "🌐 Dev URL: http://localhost:$PORT (Press Ctrl+C to stop)"
  echo "💡 Tip: To run in background instead, use: ./dev.sh --background"
  echo ""
  exec $PNPM_CMD --dir storefront run dev
fi
