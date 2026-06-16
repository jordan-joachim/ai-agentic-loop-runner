#!/usr/bin/env bash
#
# scripts/setup-phase2.sh
#
# Prepare the example repository for Phase 2 local Podman execution.
# Idempotent: repeated runs rebuild the image only when sources changed.
#
# Required environment variables: none.
#
# Usage:
#   ./scripts/setup-phase2.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="${REPO_ROOT}/workspace"
IMAGE_TAG="agentic-loop-codeengine-samples-example:latest"

log() {
  echo "[setup-phase2] $*"
}

error() {
  echo "[setup-phase2] ERROR: $*" >&2
}

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
  cp "${REPO_ROOT}/.droids/ollama-droid.md" "${WORKSPACE_DIR}/.droids/ollama-droid.md"
  log "Copied .droids/ollama-droid.md to workspace"
else
  log "workspace/.droids/ollama-droid.md already present"
fi

# ---- Build image idempotently based on checksum ----
CHECKSUM_DIR="${REPO_ROOT}/.cache"
mkdir -p "${CHECKSUM_DIR}"
CHECKSUM_FILE="${CHECKSUM_DIR}/setup-phase2.checksum"

compute_checksum() {
  # Include Containerfile and files that affect the built image.
  sha256sum "${REPO_ROOT}/Containerfile" \
    "${REPO_ROOT}/package.json" \
    "${REPO_ROOT}/package-lock.json" \
    "${REPO_ROOT}/tsconfig.json" \
    "${REPO_ROOT}/bin/run-sample-fvt" \
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
    -t "${IMAGE_TAG}" \
    "${REPO_ROOT}"
  echo "${CURRENT_CHECKSUM}" > "${CHECKSUM_FILE}"
  log "Image built and checksum recorded"
else
  log "Using existing image ${IMAGE_TAG}"
fi

log "Phase 2 setup complete: ${WORKSPACE_DIR}"
