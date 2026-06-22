#!/usr/bin/env bash
#
# scripts/setup-podman.sh
#
# Prepare the runner package for local Podman execution.
# Idempotent: repeated runs rebuild the image only when sources changed.
#
# Required environment variables: none.
#
# Usage:
#   ./scripts/setup-podman.sh

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

HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
HARNESS_PROMPT_FILE="${HARNESS_PROMPT_FILE:-prompts/fvt-coverage.md}"
HARNESS_RULES_FILE="${HARNESS_RULES_FILE:-rules.yaml}"
WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"
IMAGE_TAG="ai-agentic-loop-runner:latest"

log() {
  echo "[setup-podman] $*"
}

error() {
  echo "[setup-podman] ERROR: $*" >&2
}

# ---- Resolve the linked harness package path for the build context ----
HARNESS_PACKAGE_PATH="${REPO_ROOT}/node_modules/@ai-agentic-loop/harness"
BUILD_CONTEXT_ARGS=()
if [ -L "${HARNESS_PACKAGE_PATH}" ]; then
  HARNESS_REAL_PATH="$(readlink -f "${HARNESS_PACKAGE_PATH}")"
  log "Detected linked harness package at ${HARNESS_REAL_PATH}; building..."
  (cd "${HARNESS_REAL_PATH}" && npm run build)
  log "Harness package build complete"
  BUILD_CONTEXT_ARGS=(--build-context "harness=${HARNESS_REAL_PATH}")
else
  log "Harness package is not a symlink; skipping build"
fi

# ---- Validate Podman 5.x ----
if ! command -v podman > /dev/null 2>&1; then
  error "Podman is required but not found on PATH"
  exit 1
fi

PODMAN_VERSION="$(podman version --format '{{.Version}}' 2>/dev/null | head -n1 || true)"
PODMAN_MAJOR="$(echo "${PODMAN_VERSION}" | sed -E 's/^([0-9]+).*/\1/')"
if [ -z "${PODMAN_MAJOR}" ] || [ "${PODMAN_MAJOR}" -lt 5 ]; then
  error "Podman 5.x is required. Found: ${PODMAN_VERSION:-unknown}"
  exit 1
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

# ---- Build image idempotently based on checksum ----
CHECKSUM_DIR="${REPO_ROOT}/cache"
mkdir -p "${CHECKSUM_DIR}"
CHECKSUM_FILE="${CHECKSUM_DIR}/setup-podman.checksum"

compute_checksum() {
  # Include Containerfile and files that affect the built image.
  sha256sum "${REPO_ROOT}/Containerfile" \
    "${REPO_ROOT}/package.json" \
    "${REPO_ROOT}/package-lock.json" \
    "${REPO_ROOT}/tsconfig.json" \
    "${REPO_ROOT}/bin/harness" \
    "${REPO_ROOT}/src/index.ts" \
    "${REPO_ROOT}/src/sample-fvt/coverage-calculator.ts" \
    "${REPO_ROOT}/src/sample-fvt/coverage-reviewer.ts" \
    "${REPO_ROOT}/src/sample-fvt/planner.ts" \
    "${REPO_ROOT}/src/sample-fvt/runner.ts" \
    "${REPO_ROOT}/src/types.ts" \
    2>/dev/null | awk '{print $1}' | sort | sha256sum | awk '{print $1}'
}

CURRENT_CHECKSUM="$(compute_checksum)"
NEED_BUILD="false"

if [ "${NO_CACHE:-false}" = "true" ]; then
  NEED_BUILD="true"
  log "NO_CACHE=true; forcing rebuild"
elif [ ! -f "${CHECKSUM_FILE}" ]; then
  NEED_BUILD="true"
  log "No previous checksum found; building image"
else
  PREVIOUS_CHECKSUM="$(cat "${CHECKSUM_FILE}")"
  if [ "${CURRENT_CHECKSUM}" != "${PREVIOUS_CHECKSUM}" ]; then
    NEED_BUILD="true"
    log "Image inputs changed; rebuilding"
  else
    log "Image inputs unchanged; skipping build"
  fi
fi

if [ "${NEED_BUILD}" = "true" ]; then
  log "Building image ${IMAGE_TAG} with AGENT_RUNTIME=ollama-droid..."
  podman build \
    -f "${REPO_ROOT}/Containerfile" \
    --build-arg AGENT_RUNTIME=ollama-droid \
    "${BUILD_CONTEXT_ARGS[@]}" \
    -t "${IMAGE_TAG}" \
    "${REPO_ROOT}"
  echo "${CURRENT_CHECKSUM}" > "${CHECKSUM_FILE}"
  log "Image built and checksum recorded"
else
  log "Using existing image ${IMAGE_TAG}"
fi

log "Podman setup complete: ${WORKSPACE_DIR}"
