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
# Optional environment variables: see harness scripts/provision-fleet.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-fleet
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export CE_FLEET_SUBNET_CRNS="crn:v1:bluemix:public:is:us-south-1:..."
#   ./scripts/setup-code-engine-fleet.sh

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

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/provision-fleet.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  echo "[setup-code-engine-fleet] ERROR: harness script not found: ${HARNESS_SCRIPT}" >&2
  echo "[setup-code-engine-fleet] Expected harness repo at ../ai-agentic-loop-harness" >&2
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
