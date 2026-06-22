#!/usr/bin/env bash
#
# scripts/setup-direct.sh
#
# Prepare the runner package for direct harness execution.
# Idempotent: repeated runs do not overwrite existing files.
#
# Required environment variables: none.
#
# Usage:
#   ./scripts/setup-direct.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_REPO="$(cd "${SCRIPT_DIR}/../../ai-agentic-loop-harness" && pwd)"

# ---- Load optional .env from repo root unless disabled ----
if [ "${AGENTIC_NO_DOTENV:-false}" != "true" ] && [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

HARNESS_PROMPT_FILE="${HARNESS_PROMPT_FILE:-prompts/fvt-coverage.md}"
HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
HARNESS_RULES_FILE="${HARNESS_RULES_FILE:-rules.yaml}"

WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"
PROMPT_PATH="${REPO_ROOT}/${HARNESS_PROMPT_FILE}"
RULES_PATH="${WORKSPACE_DIR}/${HARNESS_RULES_FILE}"

log() {
  echo "[setup-direct] $*"
}

error() {
  echo "[setup-direct] ERROR: $*" >&2
}

# ---- Rebuild linked harness package if symlink ----
HARNESS_PACKAGE_PATH="${REPO_ROOT}/node_modules/@ai-agentic-loop/harness"
if [ -L "${HARNESS_PACKAGE_PATH}" ]; then
  HARNESS_REAL_PATH="$(readlink -f "${HARNESS_PACKAGE_PATH}")"
  log "Detected linked harness package at ${HARNESS_REAL_PATH}; building..."
  (cd "${HARNESS_REAL_PATH}" && npm run build)
  log "Harness package build complete"
else
  log "Harness package is not a symlink; skipping build"
fi

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

# ---- Install runner package dependencies if needed ----
if [ ! -d "${REPO_ROOT}/node_modules" ]; then
  log "Installing runner package dependencies..."
  (cd "${REPO_ROOT}" && npm install)
else
  log "node_modules already present; skipping npm install"
fi

# ---- Create workspace ----
mkdir -p "${WORKSPACE_DIR}"

# ---- Seed workspace Droid config ----
mkdir -p "${WORKSPACE_DIR}/.droids"
if [ ! -f "${WORKSPACE_DIR}/.droids/ollama-droid.md" ]; then
  cp "${HARNESS_REPO}/agent-config-samples/ollama-droid.md" "${WORKSPACE_DIR}/.droids/ollama-droid.md"
  log "Copied agent-config-samples/ollama-droid.md to workspace"
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
  node --no-warnings "${SCRIPT_DIR}/generate-plan.js" "${PROMPT_PATH}" "${WORKSPACE_DIR}/plan.yaml" "${RULES_PATH}"
  log "Generated workspace/plan.yaml from prompts/fvt-coverage.md"
else
  log "workspace/plan.yaml already present"
fi

log "Direct setup complete: ${WORKSPACE_DIR}"
