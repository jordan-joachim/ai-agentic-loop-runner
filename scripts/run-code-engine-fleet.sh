#!/usr/bin/env bash
#
# scripts/run-code-engine-fleet.sh
#
# Thin wrapper: delegates to the harness run-fleet.sh script.
# Uploads plan inputs to COS and creates a Code Engine fleet with a single task.
# The fleet mounts the COS workspace bucket at /workspace (LocalWorkspace mode).
#
# Required environment variables:
#   IBMCLOUD_API_KEY  - IBM Cloud API key
#   COS_BUCKET        - COS workspace bucket name
#   CE_IMAGE          - Fully-qualified container image (e.g. us.icr.io/ns/harness:latest)
#
# Optional environment variables: see harness scripts/run-fleet.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-fleet
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export COS_BUCKET="agentic-loop-fleet-<timestamp>"
#   export CE_IMAGE="us.icr.io/my-namespace/harness:latest"
#   ./scripts/run-code-engine-fleet.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

# ---- Load optional .env from runner root ----
if [ "${AGENTIC_NO_DOTENV:-false}" != "true" ] && [ -f "${RUNNER_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${RUNNER_ROOT}/.env"
  set +a
fi

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/run-fleet.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  echo "[run-code-engine-fleet] ERROR: harness script not found: ${HARNESS_SCRIPT}" >&2
  echo "[run-code-engine-fleet] Expected harness repo at ../ai-agentic-loop-harness" >&2
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
