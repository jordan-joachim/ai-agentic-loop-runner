#!/usr/bin/env bash
# run-podman.sh — run the harness container with a bind-mounted workspace.
#
# Validates required environment variables (HARNESS_WORKSPACE, HARNESS_AGENT_RUNTIME,
# and runtime-specific credentials), then delegates to the harness repo's
# dev/run-container.sh with the workspace bind-mounted and env vars passed through.
#
# Usage:
#   ./scripts/run-podman.sh
#
# Environment variables:
#   HARNESS_WORKSPACE         Path to the workspace directory (required)
#   HARNESS_AGENT_RUNTIME     Runtime selection: mock | droid | ollama-droid | kilo | codex (required)
#   HARNESS_IMAGE_TAG         Image tag to run (default: harness:latest)
#   HARNESS_MAX_ITERATIONS    Optional iteration limit
#   HARNESS_TIME_LIMIT_MINUTES Optional time limit
#   HARNESS_TAIL_LOGS         When "true", tail logs locally
#   OLLAMA_HOST               Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   OLLAMA_MODELS             Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   OLLAMA_MODEL              Deprecated fallback when OLLAMA_MODELS is unset
#   OLLAMA_API_KEY            Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   KILO_API_KEY              Required when HARNESS_AGENT_RUNTIME=kilo
#   DROID_API_KEY             Optional for droid runtime
#   OPENROUTER_API_KEY        Optional for droid/codex runtimes
#   CODEX_API_KEY             Required when HARNESS_AGENT_RUNTIME=codex

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log() {
  echo "[run-podman] $*"
}

error() {
  echo "[run-podman] ERROR: $*" >&2
}

# ---- Validate harness repo exists ----
if [ ! -d "${HARNESS_ROOT}" ]; then
  error "harness repository not found at ${HARNESS_ROOT}"
  error "Expected harness repo at ../ai-agentic-loop-harness relative to the runner repo"
  exit 1
fi

HARNESS_RUN_SCRIPT="${HARNESS_ROOT}/dev/run-container.sh"
if [ ! -f "${HARNESS_RUN_SCRIPT}" ]; then
  error "harness run script not found at ${HARNESS_RUN_SCRIPT}"
  exit 1
fi

# ---- Validate required env vars ----
if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  error "HARNESS_WORKSPACE is required"
  exit 1
fi

if [ -z "${HARNESS_AGENT_RUNTIME:-}" ]; then
  error "HARNESS_AGENT_RUNTIME is required (mock | droid | ollama-droid | kilo | codex)"
  exit 1
fi

case "${HARNESS_AGENT_RUNTIME}" in
  mock|droid|ollama-droid|kilo|codex)
    ;;
  *)
    error "Unsupported HARNESS_AGENT_RUNTIME: ${HARNESS_AGENT_RUNTIME}"
    error "Supported values: mock, droid, ollama-droid, kilo, codex"
    exit 1
    ;;
esac

# ---- Validate runtime-specific credentials ----
# mock runtime requires no extra credentials
if [ "${HARNESS_AGENT_RUNTIME}" = "ollama-droid" ]; then
  if [ -z "${OLLAMA_HOST:-}" ]; then
    error "OLLAMA_HOST is required for HARNESS_AGENT_RUNTIME=ollama-droid"
    exit 1
  fi
  if [ -z "${OLLAMA_MODELS:-}" ] && [ -z "${OLLAMA_MODEL:-}" ]; then
    error "OLLAMA_MODELS (or deprecated OLLAMA_MODEL) is required for HARNESS_AGENT_RUNTIME=ollama-droid"
    exit 1
  fi
fi

if [ "${HARNESS_AGENT_RUNTIME}" = "kilo" ]; then
  if [ -z "${KILO_API_KEY:-}" ]; then
    error "KILO_API_KEY is required for HARNESS_AGENT_RUNTIME=kilo"
    exit 1
  fi
fi

if [ "${HARNESS_AGENT_RUNTIME}" = "codex" ]; then
  if [ -z "${CODEX_API_KEY:-}" ]; then
    error "CODEX_API_KEY is required for HARNESS_AGENT_RUNTIME=codex"
    exit 1
  fi
  if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    error "OPENROUTER_API_KEY is required for HARNESS_AGENT_RUNTIME=codex"
    exit 1
  fi
fi

# ---- Validate workspace exists ----
if [ ! -d "${HARNESS_WORKSPACE}" ]; then
  error "Workspace directory does not exist: ${HARNESS_WORKSPACE}"
  exit 1
fi

# ---- Delegate to harness run-container.sh ----
log "Running harness container with runtime: ${HARNESS_AGENT_RUNTIME}"
log "Workspace: ${HARNESS_WORKSPACE}"
log "Harness run script: ${HARNESS_RUN_SCRIPT}"

exec bash "${HARNESS_RUN_SCRIPT}"
