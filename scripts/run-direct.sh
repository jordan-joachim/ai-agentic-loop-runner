#!/usr/bin/env bash
#
# scripts/run-direct.sh
#
# Run the harness directly against workspace/ without a container.
#
# Required environment variables depend on HARNESS_AGENT_RUNTIME (default: mock).
# For ollama-droid, requires OLLAMA_HOST, OLLAMA_MODELS, OLLAMA_API_KEY.
# For kilo, requires KILO_API_KEY. Optional: KILO_PROVIDER, KILO_MODEL.
#
# Usage:
#   ./scripts/run-direct.sh [prompt-file]
#
# The optional prompt-file argument overrides the default prompts/fvt-coverage.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Load optional .env from repo root unless disabled ----
if [ "${AGENTIC_NO_DOTENV:-false}" != "true" ] && [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

HARNESS_AGENT_RUNTIME="${HARNESS_AGENT_RUNTIME:-mock}"
HARNESS_PROMPT_FILE="${HARNESS_PROMPT_FILE:-prompts/fvt-coverage.md}"
HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
HARNESS_RULES_FILE="${HARNESS_RULES_FILE:-rules.yaml}"

WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"
PROMPT_FILE="${1:-${REPO_ROOT}/${HARNESS_PROMPT_FILE}}"
RULES_FILE="${WORKSPACE_DIR}/${HARNESS_RULES_FILE}"

log() {
  echo "[run-direct] $*"
}

error() {
  echo "[run-direct] ERROR: $*" >&2
}

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
  kilo)
    if [ -z "${KILO_API_KEY:-}" ]; then
      error "KILO_API_KEY is required for HARNESS_AGENT_RUNTIME=kilo"
      exit 1
    fi
    ;;
  *)
    error "Unsupported HARNESS_AGENT_RUNTIME: ${HARNESS_AGENT_RUNTIME}"
    error "Supported values: mock, droid, ollama-droid, kilo"
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

# ---- Generate a harness-compatible plan.yaml and rules.yaml from the prompt ----
node --no-warnings "${SCRIPT_DIR}/generate-plan.js" "${PROMPT_FILE}" "${WORKSPACE_DIR}/plan.yaml" "${RULES_FILE}"
log "Wrote plan to ${WORKSPACE_DIR}/plan.yaml"
log "Wrote rules to ${RULES_FILE}"

# ---- Run harness ----
log "Running harness with runtime: ${HARNESS_AGENT_RUNTIME}"
log "Watch logs with: ${SCRIPT_DIR}/watch-direct.sh"

# Make Kilo env vars visible to the harness process.
if [ "${HARNESS_AGENT_RUNTIME}" = "kilo" ]; then
  export KILO_API_KEY
  if [ -n "${KILO_PROVIDER:-}" ]; then
    export KILO_PROVIDER
  fi
  if [ -n "${KILO_MODEL:-}" ]; then
    export KILO_MODEL
  fi
fi

node --no-warnings "${REPO_ROOT}/node_modules/.bin/harness" --workspace "${WORKSPACE_DIR}"
