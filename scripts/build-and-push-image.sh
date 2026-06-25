#!/usr/bin/env bash
# build-and-push-image.sh — build the harness container image and push it.
#
# Usage:
#   ./scripts/build-and-push-image.sh <runtime> [backend] <image-tag>
#
# Arguments:
#   runtime   - Agent runtime to bake into the image (mock | droid | kilo | codex | bob-shell)
#   backend   - Optional backend for droid/kilo/codex (native | openrouter | ollama)
#   image-tag - Fully-qualified target image tag
#
# Environment variables:
#   NO_CACHE      Set to "true" to force a fresh build
#   BUILDER       Container builder to use (default: podman)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log()   { echo "[build-and-push-image] $*"; }
error() { echo "[build-and-push-image] ERROR: $*" >&2; }

if [ $# -lt 2 ]; then
  error "Usage: $0 <runtime> [backend] <image-tag>"
  exit 1
fi

RUNTIME="$1"
shift

BACKEND=""
if [ $# -eq 2 ]; then
  BACKEND="$1"
  shift
fi

IMAGE_TAG="$1"
BUILDER="${BUILDER:-podman}"
NO_CACHE="${NO_CACHE:-false}"

log "Building image ${IMAGE_TAG} with runtime=${RUNTIME}${BACKEND:+ backend=${BACKEND}} using ${BUILDER}"

if ! command -v "${BUILDER}" > /dev/null 2>&1; then
  error "${BUILDER} is required but not found on PATH"
  exit 1
fi

if [ ! -f "${HARNESS_ROOT}/Containerfile" ]; then
  error "Containerfile not found: ${HARNESS_ROOT}/Containerfile"
  exit 1
fi

BUILD_ARGS=(
  --build-arg "AGENT_RUNTIME=${RUNTIME}"
)

if [ -n "${BACKEND}" ]; then
  case "${RUNTIME}" in
    droid) BUILD_ARGS+=(--build-arg "DROID_BACKEND=${BACKEND}") ;;
    kilo)  BUILD_ARGS+=(--build-arg "KILO_BACKEND=${BACKEND}") ;;
    codex) BUILD_ARGS+=(--build-arg "CODEX_BACKEND=${BACKEND}") ;;
  esac
fi

if [ "${RUNTIME}" = "droid" ] || [ "${RUNTIME}" = "kilo" ] || [ "${RUNTIME}" = "codex" ]; then
  if [ "${BACKEND}" = "ollama" ]; then
    BUILD_ARGS+=(--build-arg "INSTALL_OLLAMA=true")
  fi
fi

NO_CACHE_FLAG=()
if [ "${NO_CACHE}" = "true" ]; then
  NO_CACHE_FLAG=(--no-cache)
fi

"${BUILDER}" build \
  "${NO_CACHE_FLAG[@]}" \
  -t "${IMAGE_TAG}" \
  "${BUILD_ARGS[@]}" \
  -f "${HARNESS_ROOT}/Containerfile" \
  "${HARNESS_ROOT}"

log "Pushing image ${IMAGE_TAG}"
"${BUILDER}" push "${IMAGE_TAG}"

log "Image ${IMAGE_TAG} built and pushed successfully"
