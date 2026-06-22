#!/usr/bin/env bash
# watch-podman.sh — tail live harness and agent logs from a running container.
#
# Follows container stdout/stderr via podman logs -f and tails harness.log
# and per-iteration agent logs (iter-*/doer.log, iter-*/reviewer.log) inside
# the container via podman exec.
#
# Usage:
#   ./scripts/watch-podman.sh [CONTAINER_NAME]
#
# If CONTAINER_NAME is not provided, the script attempts to discover the
# most recently started harness container.
#
# Environment variables:
#   HARNESS_CONTAINER_NAME   Name of the running harness container (optional;
#                            overrides the positional argument).

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  echo "[watch-podman] $*"
}

error() {
  echo "[watch-podman] ERROR: $*" >&2
}

# ---- Determine container name ----
CONTAINER_NAME="${HARNESS_CONTAINER_NAME:-${1:-}}"

if [ -z "${CONTAINER_NAME}" ]; then
  # Try to discover the most recently created harness container.
  CONTAINER_NAME="$(podman ps --filter "name=harness-" --format '{{.Names}}' --sort started 2>/dev/null | tail -1 || true)"
  if [ -z "${CONTAINER_NAME}" ]; then
    error "No container name provided and no running harness container found."
    error "Usage: $0 [CONTAINER_NAME]"
    error "Or set HARNESS_CONTAINER_NAME environment variable."
    exit 1
  fi
  log "Discovered container: ${CONTAINER_NAME}"
fi

# ---- Validate podman is available ----
if ! command -v podman > /dev/null 2>&1; then
  error "podman is required but not found on PATH"
  exit 1
fi

# ---- Validate container exists and is running ----
if ! podman container inspect "${CONTAINER_NAME}" > /dev/null 2>&1; then
  error "Container '${CONTAINER_NAME}' does not exist."
  exit 1
fi

CONTAINER_STATE="$(podman container inspect "${CONTAINER_NAME}" --format '{{.State.Status}}' 2>/dev/null || true)"
if [ "${CONTAINER_STATE}" != "running" ]; then
  error "Container '${CONTAINER_NAME}' is not running (state: ${CONTAINER_STATE:-unknown})."
  exit 1
fi

log "Watching logs for container: ${CONTAINER_NAME}"

# ---- Start both log tails in parallel ----
# 1. podman logs -f follows the container's combined stdout/stderr.
# 2. podman exec ... tail -f follows harness.log and per-iteration agent logs
#    inside the container workspace.

podman logs -f "${CONTAINER_NAME}" &
PODMAN_LOGS_PID=$!

podman exec "${CONTAINER_NAME}" sh -c \
  "tail -f /workspace/harness.log /workspace/iter-*/doer.log /workspace/iter-*/reviewer.log 2>/dev/null" &
AGENT_LOGS_PID=$!

log "Following container stdout/stderr (podman logs -f ${CONTAINER_NAME})"
log "Following harness and agent logs inside the container"

# Wait for either background process to exit (e.g. container stops).
wait -n ${PODMAN_LOGS_PID} ${AGENT_LOGS_PID} 2>/dev/null || true

# Clean up the remaining background process.
kill ${PODMAN_LOGS_PID} 2>/dev/null || true
kill ${AGENT_LOGS_PID} 2>/dev/null || true

log "Log watching stopped."
