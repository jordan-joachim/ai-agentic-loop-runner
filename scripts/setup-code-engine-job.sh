#!/usr/bin/env bash
#
# scripts/setup-code-engine-job.sh
#
# Thin wrapper: delegates to the harness provision-code-engine.sh script.
# Idempotently provisions all IBM Cloud resources needed to run the harness
# as a Code Engine job (resource group, CE project, COS instance, COS bucket,
# IAM service ID, HMAC credentials, CE secret, CE job definition).
#
# Required environment variables:
#   IBMCLOUD_API_KEY  - IBM Cloud API key
#   CE_IMAGE          - Fully-qualified container image (e.g. us.icr.io/ns/harness:latest)
#
# Optional environment variables: see harness scripts/provision-code-engine.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-job
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export CE_IMAGE="us.icr.io/my-namespace/harness:latest"
#   ./scripts/setup-code-engine-job.sh

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

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/provision-code-engine.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  echo "[setup-code-engine-job] ERROR: harness script not found: ${HARNESS_SCRIPT}" >&2
  echo "[setup-code-engine-job] Expected harness repo at ../ai-agentic-loop-harness" >&2
  exit 1
fi

# Set resource group default if not already set
export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"

# Prevent double-.env loading in the harness script
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
