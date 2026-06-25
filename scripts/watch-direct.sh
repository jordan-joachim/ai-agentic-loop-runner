#!/usr/bin/env bash
# watch-direct.sh — tail live harness and agent logs for a direct run.
#
# Follows harness.log and per-iteration agent logs inside a workspace directory.
#
# Usage:
#   ./scripts/watch-direct.sh [WORKSPACE_PATH]
#
# If WORKSPACE_PATH is not provided, the script uses the HARNESS_WORKSPACE
# environment variable, defaulting to ./workspace.
#
# Environment variables:
#   HARNESS_WORKSPACE  Path to the workspace directory (optional;
#                      overrides the positional argument).

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  echo "[watch-direct] $*"
}

error() {
  echo "[watch-direct] ERROR: $*" >&2
}

# ---- Determine workspace path ----
WORKSPACE_PATH="${1:-${HARNESS_WORKSPACE:-}}"
if [ -z "${WORKSPACE_PATH}" ]; then
  WORKSPACE_PATH="${RUNNER_ROOT}/workspace"
fi

if [ ! -d "${WORKSPACE_PATH}" ]; then
  error "Workspace directory does not exist: ${WORKSPACE_PATH}"
  error "Usage: $0 [WORKSPACE_PATH]"
  error "Or set HARNESS_WORKSPACE environment variable."
  exit 1
fi

WORKSPACE_ABS="$(cd "${WORKSPACE_PATH}" && pwd)"
log "Watching logs for workspace: ${WORKSPACE_ABS}"

# ---- Tail harness.log and per-iteration agent logs ----
exec tail -f \
  "${WORKSPACE_ABS}/harness.log" \
  "${WORKSPACE_ABS}/iter-"*"/doer.log" \
  "${WORKSPACE_ABS}/iter-"*"/reviewer.log" \
  2>/dev/null
