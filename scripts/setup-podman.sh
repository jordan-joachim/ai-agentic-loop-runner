#!/usr/bin/env bash
# setup-podman.sh — idempotent Podman setup for the AI agentic loop runner.
#
# Builds the harness container image using the harness repo's Containerfile
# and prepares a workspace directory for bind-mounting.
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

# ---- Validate harness repo exists ----
if [ ! -d "${HARNESS_ROOT}" ]; then
  log "ERROR: harness repository not found at ${HARNESS_ROOT}"
  log "Expected harness repo at ../ai-agentic-loop-harness relative to the runner repo"
  exit 1
fi

HARNESS_BUILD_SCRIPT="${HARNESS_ROOT}/dev/build-container.sh"
if [ ! -f "${HARNESS_BUILD_SCRIPT}" ]; then
  log "ERROR: harness build script not found at ${HARNESS_BUILD_SCRIPT}"
  exit 1
fi

HARNESS_CONTAINERFILE="${HARNESS_ROOT}/Containerfile"
if [ ! -f "${HARNESS_CONTAINERFILE}" ]; then
  log "ERROR: harness Containerfile not found at ${HARNESS_CONTAINERFILE}"
  exit 1
fi

# ---- Build the harness container image ----
log "Building harness container image with AGENT_RUNTIME=${AGENT_RUNTIME}"
log "Harness repo: ${HARNESS_ROOT}"

# Delegate to the harness build script, which handles idempotency
# (skips rebuild when image exists unless NO_CACHE=true).
AGENT_RUNTIME="${AGENT_RUNTIME}" \
  HARNESS_IMAGE_TAG="${HARNESS_IMAGE_TAG}" \
  NO_CACHE="${NO_CACHE}" \
  bash "${HARNESS_BUILD_SCRIPT}"

# ---- Create workspace directory ----
WORKSPACE_DIR="${RUNNER_ROOT}/workspace"
if [ ! -d "${WORKSPACE_DIR}" ]; then
  log "Creating workspace directory: ${WORKSPACE_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
else
  log "Workspace directory already exists: ${WORKSPACE_DIR}"
fi

log "Setup complete. Image: ${HARNESS_IMAGE_TAG}, Workspace: ${WORKSPACE_DIR}"
