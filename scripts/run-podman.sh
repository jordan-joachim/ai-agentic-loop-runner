#!/usr/bin/env bash
# run-podman.sh — run the harness container with a bind-mounted workspace.
#
# Resolves PROMPT_SOURCE, validates required environment variables,
# writes workspace/config/agents.json, then runs the harness container image
# directly with the workspace bind-mounted and env vars passed through.
#
# Usage:
#   ./scripts/run-podman.sh
#
# Environment variables:
#   HARNESS_WORKSPACE          Path to the workspace directory (required)
#   HARNESS_AGENT_RUNTIME      Runtime selection: mock | droid | kilo | codex | bob-shell (required)
#   HARNESS_AGENT_BACKEND      Optional backend override (native | openrouter | ollama)
#   HARNESS_AGENT_MODEL        Optional model override
#   HARNESS_IMAGE_TAG          Image tag to run (default: harness:latest)
#   HARNESS_MAX_ITERATIONS     Optional iteration limit
#   HARNESS_TIME_LIMIT_MINUTES Optional time limit
#   HARNESS_TAIL_LOGS          When "true", launch a background podman logs -f
#                              before the main run so logs appear locally in real time.
#   OLLAMA_HOST                Required when backend=ollama
#   OLLAMA_MODELS              Required when backend=ollama
#   OLLAMA_MODEL               Deprecated fallback when OLLAMA_MODELS is unset
#   OLLAMA_API_KEY             Required when backend=ollama
#   KILO_API_KEY               Required when HARNESS_AGENT_RUNTIME=kilo and backend=native
#   OPENROUTER_API_KEY         Required when backend=openrouter
#   CODEX_API_KEY              Required when HARNESS_AGENT_RUNTIME=codex
#   BOBSHELL_API_KEY           Required when HARNESS_AGENT_RUNTIME=bob-shell

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

# ---- Validate workspace path ----
if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  error "HARNESS_WORKSPACE is required"
  exit 1
fi

if [ ! -d "${HARNESS_WORKSPACE}" ]; then
  error "Workspace directory does not exist: ${HARNESS_WORKSPACE}"
  exit 1
fi
WORKSPACE_ABS="$(cd "${HARNESS_WORKSPACE}" && pwd)"

if [ -z "${HARNESS_AGENT_RUNTIME:-}" ]; then
  error "HARNESS_AGENT_RUNTIME is required (mock | droid | kilo | codex | bob-shell)"
  exit 1
fi

# ---- Validate agent config and write workspace/config/agents.json ----
log "Validating agent config: runtime=${HARNESS_AGENT_RUNTIME} backend=${HARNESS_AGENT_BACKEND:-default}"
node -e "require('${RUNNER_ROOT}/dist/agent-config').validateAgentConfig(process.env.HARNESS_AGENT_RUNTIME, process.env.HARNESS_AGENT_BACKEND, process.env)"
node -e "require('${RUNNER_ROOT}/dist/agent-config').writeAgentsJson('${WORKSPACE_ABS}', require('${RUNNER_ROOT}/dist/agent-config').buildAgentConfig(process.env.HARNESS_AGENT_RUNTIME, process.env.HARNESS_AGENT_BACKEND, process.env.HARNESS_AGENT_MODEL, process.env))"
log "Wrote workspace/config/agents.json"

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

if [ -n "${BOBSHELL_API_KEY:-}" ]; then
  ENV_ARGS+=( -e "BOBSHELL_API_KEY=${BOBSHELL_API_KEY}" )
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

# ---- Gather results ----
if [ -f "${WORKSPACE_ABS}/result.yaml" ]; then
  log "Result file: ${WORKSPACE_ABS}/result.yaml"
  STATUS_LINE="$(grep -E '^status:' "${WORKSPACE_ABS}/result.yaml" | head -1 || true)"
  ITERATIONS_LINE="$(grep -E '^iterations:' "${WORKSPACE_ABS}/result.yaml" | head -1 || true)"
  log "Result ${STATUS_LINE:-status: unknown}"
  log "Result ${ITERATIONS_LINE:-iterations: unknown}"
else
  log "WARNING: result.yaml not found in local workspace after container exited"
  log "If the workspace was not bind-mounted, retrieve results from the container workspace."
fi

exit ${EXIT_CODE}
