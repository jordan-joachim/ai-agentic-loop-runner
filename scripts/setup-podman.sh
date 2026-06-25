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
AGENT_RUNTIME="${AGENT_RUNTIME:-${HARNESS_AGENT_RUNTIME:-mock}}"
HARNESS_IMAGE_TAG="${HARNESS_IMAGE_TAG:-harness:latest}"
NO_CACHE="${NO_CACHE:-false}"
# Map unified droid runtime onto AGENT_RUNTIME; HARNESS_AGENT_BACKEND selects Ollama at build time.
AGENT_BACKEND="${AGENT_BACKEND:-${HARNESS_AGENT_BACKEND:-}}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-false}"

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
  mock|droid|kilo|codex|bob-shell)
    ;;
  ollama-droid)
    # Deprecated alias — treat as droid with Ollama backend.
    log "WARN: AGENT_RUNTIME=ollama-droid is deprecated; using droid with backend=ollama"
    AGENT_RUNTIME="droid"
    AGENT_BACKEND="ollama"
    ;;
  *)
    log "ERROR: unsupported AGENT_RUNTIME: ${AGENT_RUNTIME}"
    log "Supported values: mock, droid, kilo, codex, bob-shell"
    exit 1
    ;;
esac

# ---- Select backend-specific build args ----
RUNTIME_BACKEND_ARG=""
case "${AGENT_RUNTIME}" in
  droid)
    RUNTIME_BACKEND_ARG="DROID_BACKEND=${AGENT_BACKEND:-openrouter}"
    if [ "${AGENT_BACKEND:-openrouter}" = "ollama" ]; then
      INSTALL_OLLAMA="true"
    fi
    ;;
  kilo)
    RUNTIME_BACKEND_ARG="KILO_BACKEND=${AGENT_BACKEND:-native}"
    if [ "${AGENT_BACKEND:-native}" = "ollama" ]; then
      INSTALL_OLLAMA="true"
    fi
    ;;
  codex)
    RUNTIME_BACKEND_ARG="CODEX_BACKEND=${AGENT_BACKEND:-openrouter}"
    if [ "${AGENT_BACKEND:-openrouter}" = "ollama" ]; then
      INSTALL_OLLAMA="true"
    fi
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
log "Building image ${HARNESS_IMAGE_TAG} with AGENT_RUNTIME=${AGENT_RUNTIME}${RUNTIME_BACKEND_ARG:+ ${RUNTIME_BACKEND_ARG}}${INSTALL_OLLAMA=true:+ INSTALL_OLLAMA=true}${HARNESS_AGENT_MODEL:+ MODEL=${HARNESS_AGENT_MODEL}}"

NO_CACHE_FLAG=()
if [ "${NO_CACHE}" = "true" ]; then
  NO_CACHE_FLAG=(--no-cache)
fi

BUILD_ARGS=(
  --build-arg "AGENT_RUNTIME=${AGENT_RUNTIME}"
)
if [ -n "${RUNTIME_BACKEND_ARG}" ]; then
  BUILD_ARGS+=(--build-arg "${RUNTIME_BACKEND_ARG}")
fi
if [ "${INSTALL_OLLAMA}" = "true" ]; then
  BUILD_ARGS+=(--build-arg "INSTALL_OLLAMA=true")
fi

podman build \
  "${NO_CACHE_FLAG[@]}" \
  -t "${HARNESS_IMAGE_TAG}" \
  "${BUILD_ARGS[@]}" \
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
