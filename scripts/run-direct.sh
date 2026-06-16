#!/usr/bin/env bash
#
# scripts/run-direct.sh
#
# Run the harness directly against workspace/ without a container.
#
# Required environment variables depend on HARNESS_AGENT_RUNTIME (default: mock).
# For ollama-droid, requires OLLAMA_HOST, OLLAMA_MODELS, OLLAMA_API_KEY.
#
# Usage:
#   ./scripts/run-direct.sh [prompt-file]
#
# The optional prompt-file argument overrides the default prompts/fvt-coverage.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="${REPO_ROOT}/workspace"

log() {
  echo "[run-direct] $*"
}

error() {
  echo "[run-direct] ERROR: $*" >&2
}

HARNESS_AGENT_RUNTIME="${HARNESS_AGENT_RUNTIME:-mock}"
PROMPT_FILE="${1:-${REPO_ROOT}/prompts/fvt-coverage.md}"

# ---- Validate runtime-specific environment variables ----
case "${HARNESS_AGENT_RUNTIME}" in
  mock|droid)
    ;;
  ollama-droid)
    if [ -z "${OLLAMA_HOST:-}" ]; then
      error "OLLAMA_HOST is required for HARNESS_AGENT_RUNTIME=ollama-droid"
      exit 1
    fi
    if [ -z "${OLLAMA_MODELS:-}" ] && [ -z "${OLLAMA_MODEL:-}" ]; then
      error "OLLAMA_MODELS (or deprecated OLLAMA_MODEL fallback) is required for HARNESS_AGENT_RUNTIME=ollama-droid"
      exit 1
    fi
    if [ -z "${OLLAMA_API_KEY:-}" ]; then
      error "OLLAMA_API_KEY is required for HARNESS_AGENT_RUNTIME=ollama-droid"
      exit 1
    fi
    ;;
  *)
    error "Unsupported HARNESS_AGENT_RUNTIME: ${HARNESS_AGENT_RUNTIME}"
    error "Supported values: mock, droid, ollama-droid"
    exit 1
    ;;
esac

# ---- Ensure workspace exists ----
mkdir -p "${WORKSPACE_DIR}"

# ---- Validate prompt file ----
if [ ! -f "${PROMPT_FILE}" ]; then
  error "Prompt file does not exist: ${PROMPT_FILE}"
  exit 1
fi

# ---- Copy prompt into workspace as plan.yaml ----
cp "${PROMPT_FILE}" "${WORKSPACE_DIR}/plan.yaml"
log "Wrote prompt to ${WORKSPACE_DIR}/plan.yaml"

# ---- Run harness ----
log "Running harness with runtime: ${HARNESS_AGENT_RUNTIME}"
log "Watch logs with: ${SCRIPT_DIR}/watch-direct.sh"

node --no-warnings "${REPO_ROOT}/node_modules/.bin/harness" --workspace "${WORKSPACE_DIR}"
