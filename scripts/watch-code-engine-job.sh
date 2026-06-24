#!/usr/bin/env bash
#
# scripts/watch-code-engine-job.sh
#
# Thin wrapper: delegates to the harness watch-code-engine-job.sh script.
# Follows the logs of a running Code Engine job run and prints COS download
# instructions when the run completes.
#
# Required environment variables:
#   IBMCLOUD_API_KEY  - IBM Cloud API key
#
# Optional environment variables: see harness scripts/watch-code-engine-job.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-job
#
# Usage:
#   ./scripts/watch-code-engine-job.sh [job-run-name]

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

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/watch-code-engine-job.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  echo "[watch-code-engine-job] ERROR: harness script not found: ${HARNESS_SCRIPT}" >&2
  echo "[watch-code-engine-job] Expected harness repo at ../ai-agentic-loop-harness" >&2
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
