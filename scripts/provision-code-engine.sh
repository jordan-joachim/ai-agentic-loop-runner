#!/usr/bin/env bash
#
# scripts/provision-code-engine.sh
#
# Idempotently provision IBM Cloud Code Engine resources for running sample FVT.
#
# Required environment variables:
#   IBMCLOUD_API_KEY      - IBM Cloud API key
#   IBMCLOUD_REGION       - target region (default: us-south)
#
# Optional environment variables:
#   CE_RESOURCE_GROUP     - resource group name (default: agenticloop)
#   CE_PROJECT_NAME       - Code Engine project name (default: agentic-loop-samples-fvt)
#   CE_JOB_NAME           - Code Engine job name (default: sample-fvt-job)
#   CE_IMAGE              - container image to run (default: icr.io/NOT_SET/sample-fvt:latest)
#
# Usage:
#   ./scripts/provision-code-engine.sh

set -euo pipefail

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-samples-fvt}"
JOB_NAME="${CE_JOB_NAME:-sample-fvt-job}"
IMAGE="${CE_IMAGE:-icr.io/NOT_SET/sample-fvt:latest}"

echo "[provision-code-engine] Target region: ${REGION}"
echo "[provision-code-engine] Resource group: ${RESOURCE_GROUP}"
echo "[provision-code-engine] Project: ${PROJECT_NAME}"
echo "[provision-code-engine] Job: ${JOB_NAME}"

# Ensure ibmcloud CLI is available
if ! command -v ibmcloud > /dev/null 2>&1; then
  echo "[provision-code-engine] ERROR: ibmcloud CLI not found." >&2
  exit 1
fi

# Login and target resource group
ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null

# Ensure resource group exists, create if not
if ! ibmcloud resource group "${RESOURCE_GROUP}" > /dev/null 2>&1; then
  echo "[provision-code-engine] Creating resource group: ${RESOURCE_GROUP}"
  ibmcloud resource group-create "${RESOURCE_GROUP}"
fi

# Ensure Code Engine project exists
if ! ibmcloud ce project get --name "${PROJECT_NAME}" > /dev/null 2>&1; then
  echo "[provision-code-engine] Creating Code Engine project: ${PROJECT_NAME}"
  ibmcloud ce project create --name "${PROJECT_NAME}"
else
  echo "[provision-code-engine] Code Engine project already exists: ${PROJECT_NAME}"
fi

ibmcloud ce project select --name "${PROJECT_NAME}"

# Ensure job exists
current_job=$(ibmcloud ce job get --name "${JOB_NAME}" --output json 2> /dev/null || true)
if [ -z "${current_job}" ]; then
  echo "[provision-code-engine] Creating Code Engine job: ${JOB_NAME}"
  ibmcloud ce job create \
    --name "${JOB_NAME}" \
    --image "${IMAGE}" \
    --env-from-configmap "sample-fvt-config" \
    --cpu 1 \
    --memory 2G \
    --max-execution-time 7200
else
  echo "[provision-code-engine] Code Engine job already exists: ${JOB_NAME}"
fi

echo "[provision-code-engine] Done."
