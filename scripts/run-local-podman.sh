#!/usr/bin/env bash
#
# scripts/run-local-podman.sh
#
# Build and run the sample-fvt example locally with Podman, then push FVT
# changes as a GitHub PR when configured.
#
# Required environment variables:
#   OLLAMA_HOST       - URL of the Ollama server
#   OLLAMA_MODELS     - comma-separated list of Ollama model tags to use
#   OLLAMA_API_KEY    - API key for the Ollama server, if authentication is required
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
#   ./scripts/run-local-podman.sh [samples-dir]
#
# The optional samples-dir argument overrides the default path inside the
# container.

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
HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
HARNESS_RULES_FILE="${HARNESS_RULES_FILE:-rules.yaml}"
WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"
RULES_FILE="${WORKSPACE_DIR}/${HARNESS_RULES_FILE}"

# Validate required environment variables, falling back to deprecated OLLAMA_MODEL.
if [ -z "${OLLAMA_HOST:-}" ]; then
  echo "[run-local-podman] ERROR: OLLAMA_HOST environment variable is required." >&2
  exit 1
fi

if [ -z "${OLLAMA_MODELS:-}" ] && [ -z "${OLLAMA_MODEL:-}" ]; then
  echo "[run-local-podman] ERROR: OLLAMA_MODELS environment variable is required. (OLLAMA_MODEL is accepted as a deprecated fallback.)" >&2
  exit 1
fi

if [ -z "${OLLAMA_API_KEY:-}" ]; then
  echo "[run-local-podman] ERROR: OLLAMA_API_KEY environment variable is required." >&2
  exit 1
fi

OLLAMA_MODELS="${OLLAMA_MODELS:-${OLLAMA_MODEL:-}}"

echo "[run-local-podman] Building image ${IMAGE_TAG} with AGENT_RUNTIME=ollama-droid..."
echo "[run-local-podman] Follow container logs live with: podman logs -f agentic-loop-fvt"
podman build \
  -f "${REPO_ROOT}/Containerfile" \
  --build-arg AGENT_RUNTIME=ollama-droid \
  -t "${IMAGE_TAG}" \
  "${REPO_ROOT}"

mkdir -p "${WORKSPACE_DIR}"
mkdir -p "${WORKSPACE_DIR}/.droids"

# Copy Droid config into the workspace if not already mounted
if [ ! -f "${WORKSPACE_DIR}/.droids/ollama-droid.md" ]; then
  cp "${REPO_ROOT}/.droids/ollama-droid.md" "${WORKSPACE_DIR}/.droids/ollama-droid.md"
fi

# Generate a minimal rules.yaml if missing
if [ ! -f "${RULES_FILE}" ]; then
  cat > "${RULES_FILE}" <<'EOF'
rules:
  - id: RULE-001
    name: Keep tests in sample language
    description: New FVT tests must use the same language and framework as the sample project.
    required: true
    check: language matches
  - id: RULE-002
    name: Do not modify application source
    description: Prefer adding tests over changing application code.
    required: true
    check: source diff empty
EOF
fi

SAMPLES_ARG=""
SAMPLES_MOUNT=""
if [ $# -ge 1 ]; then
  SAMPLES_ARG="--samples-dir /workspace/inputs/code-engine-samples/samples/ai"
  SAMPLES_MOUNT="-v \"$1:/workspace/inputs/code-engine-samples/samples/ai:Z\""
fi

# Optionally start a background log tail before the container runs.
if [ "${FVT_TAIL_LOGS:-false}" = "true" ]; then
  echo "[run-local-podman] Starting background log tail: podman logs -f agentic-loop-fvt"
  podman logs -f agentic-loop-fvt &
fi

eval "podman run --rm --name agentic-loop-fvt \
  -v \"${WORKSPACE_DIR}:/workspace:Z\" \
  ${SAMPLES_MOUNT} \
  -e HARNESS_AGENT_RUNTIME=ollama-droid \
  -e NODE_OPTIONS=--no-warnings \
  -e OLLAMA_HOST=\"${OLLAMA_HOST}\" \
  -e OLLAMA_MODELS=\"${OLLAMA_MODELS}\" \
  -e OLLAMA_API_KEY=\"${OLLAMA_API_KEY}\" \
  -e DROID_DOER_CONFIG=/workspace/.droids/ollama-droid.md \
  -e DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md \
  -e FVT_MAX_ITERATIONS=\"${FVT_MAX_ITERATIONS:-5}\" \
  -e FVT_TIME_LIMIT_MINUTES=\"${FVT_TIME_LIMIT_MINUTES:-120}\" \
  -e FVT_COVERAGE_THRESHOLD=\"${FVT_COVERAGE_THRESHOLD:-100}\" \
  -e FVT_COVERAGE_STALL_DELTA=\"${FVT_COVERAGE_STALL_DELTA:-5}\" \
  \"${IMAGE_TAG}\" \
  ${SAMPLES_ARG}"

echo "[run-local-podman] Follow container logs live with: podman logs -f agentic-loop-fvt"

# After the harness loop finishes, create a PR if a GitHub token is present.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "[run-local-podman] Checking for FVT changes to push..."
  "${SCRIPT_DIR}/create-pr.sh" "${WORKSPACE_DIR}"
else
  echo "[run-local-podman] GITHUB_TOKEN not set; skipping PR creation."
fi
