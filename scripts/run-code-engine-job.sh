#!/usr/bin/env bash
#
# scripts/run-code-engine-job.sh
#
# Submit the sample-fvt Code Engine job.
#
# Required environment variables:
#   IBMCLOUD_API_KEY      - IBM Cloud API key
#   IBMCLOUD_REGION       - target region (default: us-south)
#
# Optional environment variables:
#   CE_RESOURCE_GROUP     - resource group name (default: agenticloop)
#   CE_PROJECT_NAME       - Code Engine project name (default: agentic-loop-samples-fvt)
#   CE_JOB_NAME           - Code Engine job name (default: sample-fvt-job)
#
# Usage:
#   ./scripts/run-code-engine-job.sh

set -euo pipefail

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-samples-fvt}"
JOB_NAME="${CE_JOB_NAME:-sample-fvt-job}"

echo "[run-code-engine-job] Target region: ${REGION}"
echo "[run-code-engine-job] Resource group: ${RESOURCE_GROUP}"
echo "[run-code-engine-job] Project: ${PROJECT_NAME}"
echo "[run-code-engine-job] Job: ${JOB_NAME}"

if ! command -v ibmcloud > /dev/null 2>&1; then
  echo "[run-code-engine-job] ERROR: ibmcloud CLI not found." >&2
  exit 1
fi

ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null
ibmcloud ce project select --name "${PROJECT_NAME}"

echo "[run-code-engine-job] Submitting job run..."
ibmcloud ce jobrun submit --job "${JOB_NAME}"

echo "[run-code-engine-job] Job submitted. Use 'ibmcloud ce jobrun list' to monitor."
