#!/usr/bin/env bash
#
# scripts/run-code-engine-job.sh
#
# Thin wrapper: delegates to the harness run-code-engine-job.sh script.
# Uploads plan inputs to COS and submits a Code Engine job run.
#
# Required environment variables:
#   IBMCLOUD_API_KEY  - IBM Cloud API key
#   COS_BUCKET        - COS bucket name
#
# Optional environment variables: see harness scripts/run-code-engine-job.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-job
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export COS_BUCKET="agentic-loop-job-<timestamp>"
#   ./scripts/run-code-engine-job.sh

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

# ---- Fetch prompt from PROMPT_SOURCE (if set) ----
# Resolves bare name / dir: / file: / github: to plan.yaml + rules.yaml in workspace.
if [ -n "${PROMPT_SOURCE:-}" ]; then
  HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
  WORKSPACE_DIR="${RUNNER_ROOT}/${HARNESS_WORKSPACE_DIR}"
  mkdir -p "${WORKSPACE_DIR}"
  echo "[run-code-engine-job] PROMPT_SOURCE=${PROMPT_SOURCE} — fetching prompt ..."
  PROMPT_SOURCE="${PROMPT_SOURCE}" \
  PROMPT_GENERATE_PLAN="${PROMPT_GENERATE_PLAN:-}" \
    bash "${SCRIPT_DIR}/fetch-prompt.sh" "${WORKSPACE_DIR}"
fi

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/run-code-engine-job.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  echo "[run-code-engine-job] ERROR: harness script not found: ${HARNESS_SCRIPT}" >&2
  echo "[run-code-engine-job] Expected harness repo at ../ai-agentic-loop-harness" >&2
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

exec "${HARNESS_SCRIPT}" "$@"
