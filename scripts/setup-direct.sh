#!/usr/bin/env bash
#
# scripts/setup-direct.sh
#
# Prepare the example repository for direct harness execution.
# Idempotent: repeated runs do not overwrite existing files.
#
# Required environment variables: none.
#
# Usage:
#   ./scripts/setup-direct.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="${REPO_ROOT}/workspace"

log() {
  echo "[setup-direct] $*"
}

error() {
  echo "[setup-direct] ERROR: $*" >&2
}

# ---- Validate Node.js 22+ ----
if ! command -v node > /dev/null 2>&1; then
  error "Node.js is required but not found on PATH"
  exit 1
fi

NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  error "Node.js 22+ is required. Found: $(node --version)"
  exit 1
fi

# ---- Install example repo dependencies if needed ----
if [ ! -d "${REPO_ROOT}/node_modules" ]; then
  log "Installing example repository dependencies..."
  (cd "${REPO_ROOT}" && npm install)
else
  log "node_modules already present; skipping npm install"
fi

# ---- Create workspace ----
mkdir -p "${WORKSPACE_DIR}"

# ---- Seed workspace Droid config ----
mkdir -p "${WORKSPACE_DIR}/.droids"
if [ ! -f "${WORKSPACE_DIR}/.droids/ollama-droid.md" ]; then
  cp "${REPO_ROOT}/.droids/ollama-droid.md" "${WORKSPACE_DIR}/.droids/ollama-droid.md"
  log "Copied .droids/ollama-droid.md to workspace"
else
  log "workspace/.droids/ollama-droid.md already present"
fi

# ---- Seed workspace plan.yaml if missing or stale ----
PLAN_NEEDS_REGEN="false"
if [ ! -f "${WORKSPACE_DIR}/plan.yaml" ]; then
  PLAN_NEEDS_REGEN="true"
# Re-generate if the existing plan.yaml is the legacy Markdown prompt
# (does not begin with the harness plan meta section).
elif [ "$(head -n1 "${WORKSPACE_DIR}/plan.yaml")" != "meta:" ]; then
  PLAN_NEEDS_REGEN="true"
fi

if [ "${PLAN_NEEDS_REGEN}" = "true" ]; then
  node --no-warnings "${SCRIPT_DIR}/generate-plan.js" "${REPO_ROOT}/prompts/fvt-coverage.md" "${WORKSPACE_DIR}/plan.yaml"
  log "Generated workspace/plan.yaml from prompts/fvt-coverage.md"
else
  log "workspace/plan.yaml already present"
fi

log "Direct setup complete: ${WORKSPACE_DIR}"
