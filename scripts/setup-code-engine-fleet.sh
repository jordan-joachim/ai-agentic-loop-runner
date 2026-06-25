#!/usr/bin/env bash
#
# scripts/setup-code-engine-fleet.sh
#
# Thin wrapper: delegates to the harness provision-fleet.sh script.
# Idempotently provisions all IBM Cloud resources needed to run the harness
# as a Code Engine fleet (resource group, CE project, COS instance, COS bucket,
# IAM service ID, HMAC credentials, CE HMAC secret, subnet pool, workspace PDS,
# task-state PDS).
#
# Required environment variables:
#   IBMCLOUD_API_KEY         - IBM Cloud API key
#   CE_FLEET_SUBNET_CRNS     - Comma-separated VPC subnet CRNs (1-3)
#
# Optional environment variables:
#   HARNESS_AGENT_RUNTIME    - Agent runtime baked into CE_IMAGE (default: mock)
#   HARNESS_AGENT_BACKEND    - Optional backend for droid/kilo/codex
#   CE_RESOURCE_GROUP        - resource group name (default: agentic-loop)
#   see harness scripts/provision-fleet.sh for full list
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export CE_FLEET_SUBNET_CRNS="crn:v1:bluemix:public:is:us-south-1:..."
#   ./scripts/setup-code-engine-fleet.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log() {
  echo "[setup-code-engine-fleet] $*"
}

error() {
  echo "[setup-code-engine-fleet] ERROR: $*" >&2
}

# ---- Load optional .env from runner root ----
if [ "${AGENTIC_NO_DOTENV:-false}" != "true" ] && [ -f "${RUNNER_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${RUNNER_ROOT}/.env"
  set +a
fi

# ---- CE_IMAGE must reference the runtime/backend selection ----
RUNTIME="${HARNESS_AGENT_RUNTIME:-mock}"
BACKEND="${HARNESS_AGENT_BACKEND:-}"

if [ -n "${BACKEND}" ]; then
  log "Provisioning Code Engine fleet resources for runtime=${RUNTIME} backend=${BACKEND}"
else
  log "Provisioning Code Engine fleet resources for runtime=${RUNTIME}"
fi

if [ -z "${CE_IMAGE:-}" ]; then
  error "CE_IMAGE is required (e.g. us.icr.io/my-namespace/harness:latest)"
  error "Build and push the image matching HARNESS_AGENT_RUNTIME=${RUNTIME} before provisioning."
  exit 1
fi

# ---- Build and push the container image if requested ----
if [ "${CE_BUILD_IMAGE:-false}" = "true" ]; then
  log "CE_BUILD_IMAGE=true — building image ${CE_IMAGE} for runtime=${RUNTIME}"
  BUILD_SCRIPT="${SCRIPT_DIR}/build-and-push-image.sh"
  if [ ! -f "${BUILD_SCRIPT}" ]; then
    error "build helper not found: ${BUILD_SCRIPT}"
    error "Create it or build and push ${CE_IMAGE} manually before provisioning."
    exit 1
  fi
  bash "${BUILD_SCRIPT}" "${RUNTIME}" "${BACKEND}" "${CE_IMAGE}"
fi

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/provision-fleet.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  error "harness script not found: ${HARNESS_SCRIPT}"
  error "Expected harness repo at ../ai-agentic-loop-harness"
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
