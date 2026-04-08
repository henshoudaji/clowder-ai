#!/bin/bash

set -euo pipefail

SCRIPT_PATH="$0"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
CONTENTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_ROOT="$CONTENTS_DIR/Resources/runtime"
APP_SUPPORT_DIR="$HOME/Library/Application Support/ClowderAI"
LOG_DIR="$HOME/Library/Logs/ClowderAI"
RUN_DIR="$APP_SUPPORT_DIR/run"
CONFIG_DIR="$APP_SUPPORT_DIR/config"
DATA_DIR="$APP_SUPPORT_DIR/data"
CACHE_DIR="$APP_SUPPORT_DIR/cache"
STATE_FILE="$RUN_DIR/runtime-state.json"
NODE_BIN="$RUNTIME_ROOT/node/bin/node"
START_SCRIPT="$RUNTIME_ROOT/scripts/start-bundle.sh"

show_dialog() {
  local message="$1"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display dialog \"${message}\" buttons {\"OK\"} default button \"OK\" with title \"Clowder AI\""
  else
    printf '%s\n' "$message"
  fi
}

mkdir -p "$APP_SUPPORT_DIR" "$LOG_DIR" "$RUN_DIR" "$CONFIG_DIR" "$DATA_DIR" "$CACHE_DIR"

export CLOWDER_APP_BUNDLE_ROOT="$CONTENTS_DIR/.."
export CLOWDER_RUNTIME_ROOT="$RUNTIME_ROOT"
export CLOWDER_USER_HOME="$APP_SUPPORT_DIR"
export CLOWDER_LOG_DIR="$LOG_DIR"
export CLOWDER_RUN_DIR="$RUN_DIR"
export CLOWDER_CONFIG_DIR="$CONFIG_DIR"
export CLOWDER_DATA_DIR="$DATA_DIR"
export CLOWDER_CACHE_DIR="$CACHE_DIR"
export MEMORY_STORE="${MEMORY_STORE:-1}"

show_start_failure() {
  local summary="$1"
  local api_tail=""
  local web_tail=""
  if [[ -f "$LOG_DIR/api.log" ]]; then
    api_tail="$(tail -n 20 "$LOG_DIR/api.log" 2>/dev/null || true)"
  fi
  if [[ -f "$LOG_DIR/web.log" ]]; then
    web_tail="$(tail -n 20 "$LOG_DIR/web.log" 2>/dev/null || true)"
  fi
  show_dialog "$summary\n\nLogs:\n$LOG_DIR\n\nAPI log tail:\n$api_tail\n\nWeb log tail:\n$web_tail"
}

if ! "$START_SCRIPT"; then
  show_start_failure "Clowder AI failed to start."
  exit 1
fi

if [[ ! -f "$STATE_FILE" ]]; then
  show_start_failure "Clowder AI started without writing runtime state."
  exit 1
fi

FRONTEND_URL="$($NODE_BIN -e 'const fs=require("node:fs");const state=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(state.frontendUrl||"");' "$STATE_FILE" 2>/dev/null || true)"

if [[ -z "$FRONTEND_URL" ]]; then
  show_start_failure "Clowder AI could not resolve the frontend URL."
  exit 1
fi

open "$FRONTEND_URL"
