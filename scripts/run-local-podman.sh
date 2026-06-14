#!/usr/bin/env bash
#
# scripts/run-local-podman.sh
#
# Build and run the sample-fvt example locally with Podman.
#
# Expects:
#   - Podman installed and running.
#   - The Code Engine AI samples repo checked out at ./workspace/inputs/code-engine-samples/
#
# Usage:
#   ./scripts/run-local-podman.sh [samples-dir]
#
# The optional samples-dir argument overrides the default path inside the
# container.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_TAG="agentic-loop-codeengine-samples-example:latest"
WORKSPACE_DIR="${REPO_ROOT}/workspace"

echo "[run-local-podman] Building image ${IMAGE_TAG}..."
podman build -f "${REPO_ROOT}/Containerfile" -t "${IMAGE_TAG}" "${REPO_ROOT}"

mkdir -p "${WORKSPACE_DIR}"

SAMPLES_ARG=""
if [ $# -ge 1 ]; then
  SAMPLES_ARG="--samples-dir /workspace/samples"
  # Mount the user-provided samples directory at /workspace/samples
  echo "[run-local-podman] Using samples directory: $1"
  podman run --rm \
    -v "${WORKSPACE_DIR}:/workspace:Z" \
    -v "$1:/workspace/samples:Z" \
    -e FVT_MAX_ITERATIONS="${FVT_MAX_ITERATIONS:-5}" \
    -e FVT_TIME_LIMIT_MINUTES="${FVT_TIME_LIMIT_MINUTES:-120}" \
    -e FVT_COVERAGE_THRESHOLD="${FVT_COVERAGE_THRESHOLD:-100}" \
    -e FVT_COVERAGE_STALL_DELTA="${FVT_COVERAGE_STALL_DELTA:-5}" \
    "${IMAGE_TAG}" \
    ${SAMPLES_ARG}
else
  echo "[run-local-podman] Using default samples directory."
  podman run --rm \
    -v "${WORKSPACE_DIR}:/workspace:Z" \
    -e FVT_MAX_ITERATIONS="${FVT_MAX_ITERATIONS:-5}" \
    -e FVT_TIME_LIMIT_MINUTES="${FVT_TIME_LIMIT_MINUTES:-120}" \
    -e FVT_COVERAGE_THRESHOLD="${FVT_COVERAGE_THRESHOLD:-100}" \
    -e FVT_COVERAGE_STALL_DELTA="${FVT_COVERAGE_STALL_DELTA:-5}" \
    "${IMAGE_TAG}"
fi
