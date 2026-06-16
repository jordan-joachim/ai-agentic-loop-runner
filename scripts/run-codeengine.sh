#!/usr/bin/env bash
#
# scripts/run-codeengine.sh
#
# Upload the local plan and inputs to COS, then submit the Code Engine job.
#
# Required environment variables:
#   IBMCLOUD_API_KEY      - IBM Cloud API key
#   COS_BUCKET            - COS bucket name
#
# Optional environment variables:
#   IBMCLOUD_REGION       - target region (default: us-south)
#   CE_RESOURCE_GROUP     - resource group name (default: agenticloop)
#   CE_PROJECT_NAME       - Code Engine project name (default: agentic-loop-ce-project)
#   CE_JOB_NAME           - Code Engine job name (default: agentic-loop-harness-job)
#   CE_JOBRUN_PREFIX      - job run name prefix (default: agentic-loop-run)
#   HARNESS_MAX_ITERATIONS  - override max iterations (default: 1)
#   HARNESS_TIME_LIMIT_MINUTES - override time limit minutes (default: 10)
#
# Usage:
#   ./scripts/run-codeengine.sh [prompt-file]
#
# The optional prompt-file argument overrides the default prompts/fvt-coverage.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  echo "[run-codeengine] $*"
}

error() {
  echo "[run-codeengine] ERROR: $*" >&2
}

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-ce-project}"
JOB_NAME="${CE_JOB_NAME:-agentic-loop-harness-job}"
JOBRUN_PREFIX="${CE_JOBRUN_PREFIX:-agentic-loop-run}"
JOBRUN_NAME="${JOBRUN_PREFIX}-$(date +%s)"
PROMPT_FILE="${1:-${REPO_ROOT}/prompts/fvt-coverage.md}"

if [ -z "${IBMCLOUD_API_KEY:-}" ]; then
  error "IBMCLOUD_API_KEY is required"
  exit 1
fi

if [ -z "${COS_BUCKET:-}" ]; then
  error "COS_BUCKET is required"
  exit 1
fi

# ---- Validate prompt file ----
if [ ! -f "${PROMPT_FILE}" ]; then
  error "Prompt file does not exist: ${PROMPT_FILE}"
  exit 1
fi

# ---- Login and target project ----
log "Logging in to IBM Cloud..."
ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null
ibmcloud ce project select --name "${PROJECT_NAME}" > /dev/null

# ---- Upload plan.yaml and any inputs to COS ----
log "Uploading plan.yaml to cos://${COS_BUCKET}/plan.yaml"
ibmcloud cos object-put --bucket "${COS_BUCKET}" --key plan.yaml --body "${PROMPT_FILE}" > /dev/null

# Upload inputs/ if present in the workspace
WORKSPACE_DIR="${REPO_ROOT}/workspace"
if [ -d "${WORKSPACE_DIR}/inputs" ]; then
  log "Uploading inputs/ prefix..."
  while IFS= read -r -d '' file; do
    rel="${file#${WORKSPACE_DIR}/}"
    log "Uploading cos://${COS_BUCKET}/${rel}"
    ibmcloud cos object-put --bucket "${COS_BUCKET}" --key "${rel}" --body "${file}" > /dev/null
  done < <(find "${WORKSPACE_DIR}/inputs" -type f -print0)
fi

# ---- Submit job run ----
log "Submitting job run: ${JOBRUN_NAME}"
args=(
  --job "${JOB_NAME}"
  --name "${JOBRUN_NAME}"
)

if [ -n "${HARNESS_MAX_ITERATIONS:-}" ]; then
  args+=(--env "HARNESS_MAX_ITERATIONS=${HARNESS_MAX_ITERATIONS}")
fi
if [ -n "${HARNESS_TIME_LIMIT_MINUTES:-}" ]; then
  args+=(--env "HARNESS_TIME_LIMIT_MINUTES=${HARNESS_TIME_LIMIT_MINUTES}")
fi

ibmcloud ce jobrun submit "${args[@]}" > /dev/null

log "Job run submitted: ${JOBRUN_NAME}"
log "Watch logs with: ${SCRIPT_DIR}/watch-codeengine.sh ${JOBRUN_NAME}"
log "Download results later with: ibmcloud cos objects --bucket ${COS_BUCKET}"
