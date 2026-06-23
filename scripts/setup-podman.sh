#!/usr/bin/env bash
# setup-podman.sh — idempotent Podman setup for the AI agentic loop runner.
#
# Builds the harness container image directly from the harness repo's
# Containerfile and prepares a workspace directory for bind-mounting.
#
# Usage:
#   ./scripts/setup-podman.sh
#
# Environment variables:
#   AGENT_RUNTIME       Agent runtime to bake into the image (default: mock)
#   HARNESS_IMAGE_TAG   Image tag for the built container (default: harness:latest)
#   NO_CACHE            Set to "true" to force a fresh build

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

# ---- Defaults ----
AGENT_RUNTIME="${AGENT_RUNTIME:-mock}"
HARNESS_IMAGE_TAG="${HARNESS_IMAGE_TAG:-harness:latest}"
NO_CACHE="${NO_CACHE:-false}"

log() {
  echo "[setup-podman] $*"
}

# ---- Validate Podman is available ----
if ! command -v podman > /dev/null 2>&1; then
  log "ERROR: podman is required but not found on PATH"
  exit 1
fi

# ---- Validate harness repo and Containerfile ----
if [ ! -d "${HARNESS_ROOT}" ]; then
  log "ERROR: harness repository not found at ${HARNESS_ROOT}"
  log "Expected harness repo at ../ai-agentic-loop-harness relative to the runner repo"
  exit 1
fi

HARNESS_CONTAINERFILE="${HARNESS_ROOT}/Containerfile"
if [ ! -f "${HARNESS_CONTAINERFILE}" ]; then
  log "ERROR: harness Containerfile not found at ${HARNESS_CONTAINERFILE}"
  exit 1
fi

# ---- Validate runtime argument ----
case "${AGENT_RUNTIME}" in
  mock|droid|ollama-droid|kilo|codex)
    ;;
  *)
    log "ERROR: unsupported AGENT_RUNTIME: ${AGENT_RUNTIME}"
    log "Supported values: mock, droid, ollama-droid, kilo, codex"
    exit 1
    ;;
esac

# ---- Idempotency: reuse existing image unless NO_CACHE=true ----
if [ "${NO_CACHE}" != "true" ]; then
  existing_id="$(podman image inspect "${HARNESS_IMAGE_TAG}" --format '{{.Id}}' 2> /dev/null || true)"
  if [ -n "${existing_id}" ]; then
    log "Image ${HARNESS_IMAGE_TAG} already exists (${existing_id}); skipping build"
    log "Set NO_CACHE=true to force a rebuild"
    exit 0
  fi
fi

# ---- Build the image ----
log "Building image ${HARNESS_IMAGE_TAG} with AGENT_RUNTIME=${AGENT_RUNTIME}"

NO_CACHE_FLAG=()
if [ "${NO_CACHE}" = "true" ]; then
  NO_CACHE_FLAG=(--no-cache)
fi

podman build \
  "${NO_CACHE_FLAG[@]}" \
  -t "${HARNESS_IMAGE_TAG}" \
  --build-arg "AGENT_RUNTIME=${AGENT_RUNTIME}" \
  -f "${HARNESS_CONTAINERFILE}" \
  "${HARNESS_ROOT}"

log "Image ${HARNESS_IMAGE_TAG} built successfully"

# ---- Create workspace directory ----
WORKSPACE_DIR="${RUNNER_ROOT}/workspace"
if [ ! -d "${WORKSPACE_DIR}" ]; then
  log "Creating workspace directory: ${WORKSPACE_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
else
  log "Workspace directory already exists: ${WORKSPACE_DIR}"
fi

log "Setup complete. Image: ${HARNESS_IMAGE_TAG}, Workspace: ${WORKSPACE_DIR}"
