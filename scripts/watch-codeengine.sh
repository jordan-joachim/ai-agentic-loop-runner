#!/usr/bin/env bash
#
# scripts/watch-codeengine.sh
#
# Follow the logs of a running Code Engine job run and print COS download instructions.
#
# Required environment variables:
#   IBMCLOUD_API_KEY      - IBM Cloud API key
#
# Optional environment variables:
#   IBMCLOUD_REGION       - target region (default: us-south)
#   CE_RESOURCE_GROUP     - resource group name (default: agenticloop)
#   CE_PROJECT_NAME       - Code Engine project name (default: agentic-loop-ce-project)
#   CE_JOB_NAME           - Code Engine job name (default: agentic-loop-harness-job)
#   COS_BUCKET            - COS bucket name (optional; only needed to download results)
#
# Usage:
#   ./scripts/watch-codeengine.sh [job-run-name]
#
# If no job-run-name is provided, uses the most recent job run for the job.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Load optional .env from repo root ----
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

log() {
  echo "[watch-codeengine] $*"
}

error() {
  echo "[watch-codeengine] ERROR: $*" >&2
}

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-ce-project}"
JOB_NAME="${CE_JOB_NAME:-agentic-loop-harness-job}"

if [ -z "${IBMCLOUD_API_KEY:-}" ]; then
  error "IBMCLOUD_API_KEY is required"
  exit 1
fi

# ---- Login and target project ----
log "Logging in to IBM Cloud..."
ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null
ibmcloud ce project select --name "${PROJECT_NAME}" > /dev/null

# ---- Resolve job run name ----
JOBRUN_NAME="${1:-}"
if [ -z "${JOBRUN_NAME}" ]; then
  JOBRUN_NAME="$(ibmcloud ce jobrun list --job "${JOB_NAME}" --output json 2>/dev/null \
    | grep -o '"name": *"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
fi

if [ -z "${JOBRUN_NAME}" ]; then
  error "Could not determine job run name. Provide one as an argument or set CE_JOB_NAME correctly."
  exit 1
fi

log "Following logs for job run: ${JOBRUN_NAME}"
ibmcloud ce jobrun logs -f --jobrun "${JOBRUN_NAME}"

# ---- Print COS download instructions ----
log ""
log "To download result artifacts from COS, run:"
if [ -n "${COS_BUCKET:-}" ]; then
  log "  ibmcloud cos objects --bucket ${COS_BUCKET}"
  log "  ibmcloud cos object-get --bucket ${COS_BUCKET} --key result.yaml --output result.yaml"
else
  log "  export COS_BUCKET=<your-bucket-name>"
  log "  ibmcloud cos objects --bucket \${COS_BUCKET}"
  log "  ibmcloud cos object-get --bucket \${COS_BUCKET} --key result.yaml --output result.yaml"
fi
