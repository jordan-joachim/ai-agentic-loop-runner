#!/usr/bin/env bash
# run-podman.sh — run the harness container with a bind-mounted workspace.
#
# Validates required environment variables (HARNESS_WORKSPACE, HARNESS_AGENT_RUNTIME,
# and runtime-specific credentials), then runs the harness container image directly
# with the workspace bind-mounted and env vars passed through.
#
# Usage:
#   ./scripts/run-podman.sh
#
# Environment variables:
#   HARNESS_WORKSPACE          Path to the workspace directory (required)
#   HARNESS_AGENT_RUNTIME      Runtime selection: mock | droid | ollama-droid | kilo | codex (required)
#   HARNESS_IMAGE_TAG          Image tag to run (default: harness:latest)
#   HARNESS_MAX_ITERATIONS     Optional iteration limit
#   HARNESS_TIME_LIMIT_MINUTES Optional time limit
#   HARNESS_TAIL_LOGS          When "true", launch a background podman logs -f
#                              before the main run so logs appear locally in real time.
#   OLLAMA_HOST                Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   OLLAMA_MODELS              Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   OLLAMA_MODEL               Deprecated fallback when OLLAMA_MODELS is unset
#   OLLAMA_API_KEY             Required when HARNESS_AGENT_RUNTIME=ollama-droid
#   KILO_API_KEY               Required when HARNESS_AGENT_RUNTIME=kilo
#   CODEX_API_KEY              Required when HARNESS_AGENT_RUNTIME=codex
#   OPENROUTER_API_KEY         Required when HARNESS_AGENT_RUNTIME=codex

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

# ---- Fetch prompt from PROMPT_SOURCE (if set) ----
# Resolves bare name / dir: / file: / github: to plan.yaml + rules.yaml in workspace.
if [ -n "${PROMPT_SOURCE:-}" ]; then
  HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
  WORKSPACE_DIR="${RUNNER_ROOT}/${HARNESS_WORKSPACE_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
  log "PROMPT_SOURCE=${PROMPT_SOURCE} — fetching prompt ..."
  PROMPT_SOURCE="${PROMPT_SOURCE}" \
  PROMPT_GENERATE_PLAN="${PROMPT_GENERATE_PLAN:-}" \
    bash "${SCRIPT_DIR}/fetch-prompt.sh" "${WORKSPACE_DIR}"
fi

HARNESS_IMAGE_TAG="${HARNESS_IMAGE_TAG:-harness:latest}"

# ---- Validate Podman is available ----
if ! command -v podman > /dev/null 2>&1; then
  error "podman is required but not found on PATH"
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

# Note: CLI presence is checked in run-direct.sh before invoking the harness
# directly. For Podman runs the harness container image bakes in the CLI, so no
# host-side presence check is required here.

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

# ---- Resolve workspace path ----
if [ -d "${HARNESS_WORKSPACE}" ]; then
  WORKSPACE_ABS="$(cd "${HARNESS_WORKSPACE}" && pwd)"
else
  error "Workspace directory does not exist: ${HARNESS_WORKSPACE}"
  exit 1
fi

# ---- Build env var arguments for podman run ----
ENV_ARGS=(
  -e "HARNESS_AGENT_RUNTIME=${HARNESS_AGENT_RUNTIME}"
)

if [ -n "${HARNESS_MAX_ITERATIONS:-}" ]; then
  ENV_ARGS+=( -e "HARNESS_MAX_ITERATIONS=${HARNESS_MAX_ITERATIONS}" )
fi

if [ -n "${HARNESS_TIME_LIMIT_MINUTES:-}" ]; then
  ENV_ARGS+=( -e "HARNESS_TIME_LIMIT_MINUTES=${HARNESS_TIME_LIMIT_MINUTES}" )
fi

if [ -n "${OLLAMA_HOST:-}" ]; then
  ENV_ARGS+=( -e "OLLAMA_HOST=${OLLAMA_HOST}" )
fi

if [ -n "${OLLAMA_MODELS:-}" ]; then
  ENV_ARGS+=( -e "OLLAMA_MODELS=${OLLAMA_MODELS}" )
elif [ -n "${OLLAMA_MODEL:-}" ]; then
  ENV_ARGS+=( -e "OLLAMA_MODEL=${OLLAMA_MODEL}" )
fi

if [ -n "${OLLAMA_API_KEY:-}" ]; then
  ENV_ARGS+=( -e "OLLAMA_API_KEY=${OLLAMA_API_KEY}" )
fi

if [ -n "${KILO_API_KEY:-}" ]; then
  ENV_ARGS+=( -e "KILO_API_KEY=${KILO_API_KEY}" )
fi

if [ -n "${CODEX_API_KEY:-}" ]; then
  ENV_ARGS+=( -e "CODEX_API_KEY=${CODEX_API_KEY}" )
fi

if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  ENV_ARGS+=( -e "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" )
fi

# ---- Generate a deterministic container name ----
CONTAINER_NAME="harness-$(date +%s)-$$"

# ---- Optionally tail logs locally before starting ----
TAIL_PID=""
if [ "${HARNESS_TAIL_LOGS:-false}" = "true" ]; then
  log "Launching local log tail (podman logs -f ${CONTAINER_NAME})"
  podman logs -f "${CONTAINER_NAME}" 2>/dev/null &
  TAIL_PID=$!
  sleep 0.5
fi

# ---- Run the container ----
log "Running ${HARNESS_IMAGE_TAG} with workspace ${WORKSPACE_ABS}"
log "Runtime: ${HARNESS_AGENT_RUNTIME}"
log "Container name: ${CONTAINER_NAME}"
log "Follow live logs with: podman logs -f ${CONTAINER_NAME}"
log "Tail harness log inside the container with: ./scripts/watch-podman.sh ${CONTAINER_NAME}"

set +e
podman run --rm --name "${CONTAINER_NAME}" \
  -v "${WORKSPACE_ABS}:/workspace:Z" \
  "${ENV_ARGS[@]}" \
  "${HARNESS_IMAGE_TAG}"
EXIT_CODE=$?
set -e

# ---- Stop the local log tail if we started one ----
if [ -n "${TAIL_PID}" ] && kill -0 "${TAIL_PID}" 2>/dev/null; then
  kill "${TAIL_PID}" 2>/dev/null || true
fi

exit ${EXIT_CODE}
