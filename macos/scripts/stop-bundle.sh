#!/bin/bash

set -euo pipefail

RUN_DIR="${CLOWDER_RUN_DIR:-}"
if [[ -z "$RUN_DIR" ]]; then
  exit 0
fi

terminate_pid_file() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid=""
  pid="$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "$pid_file"
}

terminate_pid_file "$RUN_DIR/api.pid"
terminate_pid_file "$RUN_DIR/web.pid"
terminate_pid_file "$RUN_DIR/mcp-server.pid"
rm -f "$RUN_DIR/runtime-state.json"
