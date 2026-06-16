#!/usr/bin/env bash
#
# scripts/run-podman.sh
#
# Run the sample-fvt example in a local Podman container.
#
# Required environment variables for ollama-droid:
#   OLLAMA_HOST       - URL of the Ollama server
#   OLLAMA_MODELS     - comma-separated list of Ollama model tags
#   OLLAMA_API_KEY    - API key for the Ollama server
#
# Optional environment variables:
#   GITHUB_TOKEN      - GitHub token for PR creation
#   GITHUB_REPO       - Target repository slug, e.g. "owner/repo"
#   GITHUB_BASE_BRANCH - Base branch for the PR (default: master)
#   FVT_MAX_ITERATIONS       - default: 5
#   FVT_TIME_LIMIT_MINUTES   - default: 120
#   FVT_COVERAGE_THRESHOLD   - default: 100
#   FVT_COVERAGE_STALL_DELTA - default: 5
#   FVT_TAIL_LOGS            - set to "true" to tail container logs in the background
#
# Usage:
#   ./scripts/run-podman.sh [prompt-file]
#
# The optional prompt-file argument overrides the default prompts/fvt-coverage.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Load optional .env from repo root ----
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

IMAGE_TAG="agentic-loop-codeengine-samples-example:latest"
HARNESS_PROMPT_FILE="${HARNESS_PROMPT_FILE:-prompts/fvt-coverage.md}"
HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
HARNESS_RULES_FILE="${HARNESS_RULES_FILE:-rules.yaml}"
WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"
RULES_FILE="${WORKSPACE_DIR}/${HARNESS_RULES_FILE}"

log() {
  echo "[run-podman] $*"
}

error() {
  echo "[run-podman] ERROR: $*" >&2
}

PROMPT_FILE="${1:-${REPO_ROOT}/${HARNESS_PROMPT_FILE}}"

# ---- Validate required environment variables ----
if [ -z "${OLLAMA_HOST:-}" ]; then
  error "OLLAMA_HOST environment variable is required."
  exit 1
fi

if [ -z "${OLLAMA_MODELS:-}" ] && [ -z "${OLLAMA_MODEL:-}" ]; then
  error "OLLAMA_MODELS environment variable is required. (OLLAMA_MODEL is accepted as a deprecated fallback.)"
  exit 1
fi

if [ -z "${OLLAMA_API_KEY:-}" ]; then
  error "OLLAMA_API_KEY environment variable is required."
  exit 1
fi

OLLAMA_MODELS="${OLLAMA_MODELS:-${OLLAMA_MODEL:-}}"

# ---- Ensure workspace and Droid config exist ----
mkdir -p "${WORKSPACE_DIR}"
mkdir -p "${WORKSPACE_DIR}/.droids"
if [ ! -f "${WORKSPACE_DIR}/.droids/ollama-droid.md" ]; then
  cp "${REPO_ROOT}/.droids/ollama-droid.md" "${WORKSPACE_DIR}/.droids/ollama-droid.md"
fi

# ---- Validate prompt file ----
if [ ! -f "${PROMPT_FILE}" ]; then
  error "Prompt file does not exist: ${PROMPT_FILE}"
  exit 1
fi

# ---- Generate a harness-compatible plan.yaml and rules.yaml from the prompt ----
node --no-warnings "${SCRIPT_DIR}/generate-plan.js" "${PROMPT_FILE}" "${WORKSPACE_DIR}/plan.yaml" "${RULES_FILE}"
log "Wrote plan to ${WORKSPACE_DIR}/plan.yaml"
log "Wrote rules to ${RULES_FILE}"

# ---- Stop and remove any existing container with the same name ----
if podman container exists agentic-loop-fvt 2>/dev/null; then
  log "Removing existing container agentic-loop-fvt..."
  podman rm -f agentic-loop-fvt >/dev/null || true
fi

log "Running image ${IMAGE_TAG} with AGENT_RUNTIME=ollama-droid..."
log "Follow container logs live with: podman logs -f agentic-loop-fvt"
log "Tail workspace agent logs with: ${SCRIPT_DIR}/watch-podman.sh"

# ---- Optionally start a background log tail before the container runs ----
if [ "${FVT_TAIL_LOGS:-false}" = "true" ]; then
  log "Starting background log tail: podman logs -f agentic-loop-fvt"
  podman logs -f agentic-loop-fvt &
fi

podman run --rm --name agentic-loop-fvt \
  -v "${WORKSPACE_DIR}:/workspace:Z" \
  -e HARNESS_AGENT_RUNTIME=ollama-droid \
  -e NODE_OPTIONS=--no-warnings \
  -e OLLAMA_HOST="${OLLAMA_HOST}" \
  -e OLLAMA_MODELS="${OLLAMA_MODELS}" \
  -e OLLAMA_API_KEY="${OLLAMA_API_KEY}" \
  -e DROID_DOER_CONFIG=/workspace/.droids/ollama-droid.md \
  -e DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md \
  -e FVT_MAX_ITERATIONS="${FVT_MAX_ITERATIONS:-5}" \
  -e FVT_TIME_LIMIT_MINUTES="${FVT_TIME_LIMIT_MINUTES:-120}" \
  -e FVT_COVERAGE_THRESHOLD="${FVT_COVERAGE_THRESHOLD:-100}" \
  -e FVT_COVERAGE_STALL_DELTA="${FVT_COVERAGE_STALL_DELTA:-5}" \
  "${IMAGE_TAG}"
