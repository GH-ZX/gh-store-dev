#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT=5173
PID_FILE="$REPO_ROOT/.dev.pid"

# Shared with dev.sh so startup and shutdown agree about process ownership.
dev_process_started_at() {
  LC_ALL=C ps -p "$1" -o lstart= 2>/dev/null
}

is_repo_dev_process() {
  local pid="$1" command executable cwd
  [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 1 ] || return 1
  executable="$(ps -p "$pid" -o comm= 2>/dev/null)" || return 1
  case "${executable##*/}" in
    node|nodejs|pnpm*|npm*|corepack|npx|react-router|sh|bash|zsh) ;;
    *) return 1 ;;
  esac
  command="$(ps -p "$pid" -o command= 2>/dev/null)" || return 1
  case " $command " in
    *" react-router dev "*|*"/react-router dev "*|*"/@react-router/dev/bin.js dev "*|*"/@react-router/dev/bin.mjs dev "*|*"pnpm --dir storefront run dev "*|*"pnpm.cjs --dir storefront run dev "*|*"pnpm.js --dir storefront run dev "*|*"pnpm run dev "*|*"pnpm dev "*) ;;
    *) return 1 ;;
  esac
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  [ "$cwd" = "$REPO_ROOT" ] || [ "$cwd" = "$REPO_ROOT/storefront" ]
}

dev_listener_pids() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
}

saved_dev_pid() {
  local pid started_at
  [ -f "$PID_FILE" ] || return 1
  pid="$(sed -n '1p' "$PID_FILE")"
  started_at="$(sed -n '2p' "$PID_FILE")"
  is_repo_dev_process "$pid" || return 1
  # Old one-line PID files still require command and cwd ownership checks.
  [ -z "$started_at" ] || [ "$started_at" = "$(dev_process_started_at "$pid")" ] || return 1
  printf '%s\n' "$pid"
}

stop_repo_dev_process() {
  local pid="$1" started_at i
  is_repo_dev_process "$pid" || return 1
  started_at="$(dev_process_started_at "$pid")" || return 1
  [ -n "$started_at" ] || return 1
  echo "⏳ Stopping GH Store dev server (PID: $pid)..."
  kill -TERM "$pid" 2>/dev/null || return 1
  for i in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || return 0
    [ "$started_at" = "$(dev_process_started_at "$pid")" ] || return 0
    sleep 0.5
  done
  # A PID can be reused during the wait. Recheck before any forceful signal.
  if is_repo_dev_process "$pid" && [ "$started_at" = "$(dev_process_started_at "$pid")" ]; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

# Sourcing from dev.sh only loads the ownership helpers above.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return 0
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to identify this repository's dev server safely." >&2
  exit 1
fi

STOPPED=false
SAVED_RECORD="$(cat "$PID_FILE" 2>/dev/null || true)"
DEV_PID="$(saved_dev_pid || true)"
# Socket clients and unrelated runners are never shutdown candidates.
PORT_PIDS="$(dev_listener_pids)"
for pid in $DEV_PID $PORT_PIDS; do
  if stop_repo_dev_process "$pid"; then
    STOPPED=true
  fi
done
if [ -f "$PID_FILE" ] && [ "$(cat "$PID_FILE")" = "$SAVED_RECORD" ]; then
  rm -f "$PID_FILE"
fi

if [ "$STOPPED" = true ]; then
  echo "✅ GH Store dev server has been turned off."
else
  echo "⚡ GH Store dev server was not running."
fi
