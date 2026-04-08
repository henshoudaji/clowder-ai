#!/bin/bash

set -euo pipefail

fail() {
  printf '[macos-bundle] %s\n' "$*" >&2
  exit 64
}

log() {
  printf '[macos-bundle] %s\n' "$*" >&2
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "missing required env: $name"
  fi
}

require_env "CLOWDER_RUNTIME_ROOT"
require_env "CLOWDER_RUN_DIR"
require_env "CLOWDER_LOG_DIR"
require_env "CLOWDER_CONFIG_DIR"
require_env "CLOWDER_DATA_DIR"
require_env "CLOWDER_CACHE_DIR"

mkdir -p "$CLOWDER_RUN_DIR" "$CLOWDER_LOG_DIR" "$CLOWDER_CONFIG_DIR" "$CLOWDER_DATA_DIR" "$CLOWDER_CACHE_DIR"
mkdir -p \
  "$CLOWDER_RUNTIME_ROOT/uploads" \
  "$CLOWDER_RUNTIME_ROOT/data/connector-media" \
  "$CLOWDER_RUNTIME_ROOT/data/audit-logs" \
  "$CLOWDER_RUNTIME_ROOT/data/tts-cache" \
  "$CLOWDER_DATA_DIR/transcripts" \
  "$CLOWDER_DATA_DIR/connector-media" \
  "$CLOWDER_DATA_DIR/audit-logs" \
  "$CLOWDER_DATA_DIR/tts-cache"

NODE_BIN="$CLOWDER_RUNTIME_ROOT/node/bin/node"
API_ENTRY="$CLOWDER_RUNTIME_ROOT/packages/api/dist/index.js"
WEB_ENTRY="$CLOWDER_RUNTIME_ROOT/packages/web/server.js"
STATE_FILE="$CLOWDER_RUN_DIR/runtime-state.json"
API_PID_FILE="$CLOWDER_RUN_DIR/api.pid"
WEB_PID_FILE="$CLOWDER_RUN_DIR/web.pid"
API_LOG_FILE="$CLOWDER_LOG_DIR/api.log"
WEB_LOG_FILE="$CLOWDER_LOG_DIR/web.log"
PREVIEW_GATEWAY_PORT_FILE="$CLOWDER_RUN_DIR/preview-gateway-port"

[[ -x "$NODE_BIN" ]] || fail "bundled node not found at $NODE_BIN"
[[ -f "$API_ENTRY" ]] || fail "bundled API entry not found at $API_ENTRY"
[[ -f "$WEB_ENTRY" ]] || fail "bundled web entry not found at $WEB_ENTRY"

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

pid_from_file() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  tr -d '[:space:]' < "$pid_file"
}

cleanup_stale_pid_file() {
  local pid_file="$1"
  local pid=""
  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && ! is_pid_running "$pid"; then
    rm -f "$pid_file"
  fi
}

cleanup_stale_pid_file "$API_PID_FILE"
cleanup_stale_pid_file "$WEB_PID_FILE"

check_url_ready() {
  local url="$1"
  "$NODE_BIN" -e '
const url = process.argv[1];
const timeoutMs = Number.parseInt(process.argv[2] || "3000", 10);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
fetch(url, { signal: controller.signal }).then((response) => {
  clearTimeout(timer);
  process.exit(response.ok ? 0 : 1);
}).catch(() => {
  clearTimeout(timer);
  process.exit(1);
});
' "$url" 3000 >/dev/null 2>&1
}

select_available_port() {
  local preferred_port="$1"
  if [[ -n "$preferred_port" ]] && ! lsof -nP -iTCP:"$preferred_port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf '%s\n' "$preferred_port"
    return 0
  fi

  "$NODE_BIN" -e '
const net = require("node:net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(String(address.port));
  server.close(() => process.exit(0));
});
server.on("error", () => process.exit(1));
'
}

wait_for_ready() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  for ((i = 0; i < attempts; i += 1)); do
    if check_url_ready "$url"; then
      return 0
    fi
    sleep 1
  done
  fail "$label did not become ready at $url"
}

stop_managed_services() {
  CLOWDER_RUN_DIR="$CLOWDER_RUN_DIR" "$CLOWDER_RUNTIME_ROOT/scripts/stop-bundle.sh" >/dev/null 2>&1 || true
}

if [[ -f "$STATE_FILE" ]]; then
  existing_frontend_url="$($NODE_BIN -e 'const fs=require("node:fs");const state=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(state.frontendUrl||"");' "$STATE_FILE" 2>/dev/null || true)"
  if [[ -n "$existing_frontend_url" ]] && check_url_ready "$existing_frontend_url"; then
    log "reusing existing running bundle services at $existing_frontend_url"
    exit 0
  fi
fi

if [[ -f "$API_PID_FILE" || -f "$WEB_PID_FILE" ]]; then
  log "cleaning stale managed services before restart"
  stop_managed_services
fi

FRONTEND_PORT="${FRONTEND_PORT:-$(select_available_port 3003)}"
API_SERVER_PORT="${API_SERVER_PORT:-$(select_available_port 3004)}"
API_SERVER_HOST="${API_SERVER_HOST:-127.0.0.1}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:$API_SERVER_PORT}"
MEMORY_STORE="${MEMORY_STORE:-1}"

export FRONTEND_PORT API_SERVER_PORT API_SERVER_HOST NEXT_PUBLIC_API_URL MEMORY_STORE
export HOSTNAME="127.0.0.1"
export PORT="$FRONTEND_PORT"
export CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1
export TRANSCRIPT_DATA_DIR="$CLOWDER_DATA_DIR/transcripts"
export CONNECTOR_MEDIA_DIR="$CLOWDER_DATA_DIR/connector-media"
export AUDIT_LOG_DIR="$CLOWDER_DATA_DIR/audit-logs"
export TTS_CACHE_DIR="$CLOWDER_DATA_DIR/tts-cache"
export UPLOAD_DIR="$CLOWDER_RUNTIME_ROOT/uploads"
export PREVIEW_GATEWAY_PORT="${PREVIEW_GATEWAY_PORT:-$(select_available_port 4100)}"
export CLOWDER_API_LOG_FILE="$API_LOG_FILE"
export CLOWDER_WEB_LOG_FILE="$WEB_LOG_FILE"

printf '%s\n' "$PREVIEW_GATEWAY_PORT" > "$PREVIEW_GATEWAY_PORT_FILE"

log "starting API on http://127.0.0.1:$API_SERVER_PORT"
(
  cd "$CLOWDER_RUNTIME_ROOT"
  nohup "$NODE_BIN" "$API_ENTRY" >>"$API_LOG_FILE" 2>&1 &
  printf '%s\n' "$!" > "$API_PID_FILE"
)

log "starting web on http://127.0.0.1:$FRONTEND_PORT/"
(
  cd "$CLOWDER_RUNTIME_ROOT"
  nohup "$NODE_BIN" "$WEB_ENTRY" >>"$WEB_LOG_FILE" 2>&1 &
  printf '%s\n' "$!" > "$WEB_PID_FILE"
)

wait_for_ready "http://127.0.0.1:$API_SERVER_PORT/health" "api"
wait_for_ready "http://127.0.0.1:$FRONTEND_PORT/" "web"

"$NODE_BIN" "$CLOWDER_RUNTIME_ROOT/scripts/write-runtime-state.mjs" \
  --file "$STATE_FILE" \
  --mode bundle-production \
  --frontend-url "http://127.0.0.1:$FRONTEND_PORT/" \
  --api-url "http://127.0.0.1:$API_SERVER_PORT" \
  --frontend-port "$FRONTEND_PORT" \
  --api-port "$API_SERVER_PORT" \
  --api-pid-file "$API_PID_FILE" \
  --web-pid-file "$WEB_PID_FILE"

log "bundle services ready at http://127.0.0.1:$FRONTEND_PORT/"
