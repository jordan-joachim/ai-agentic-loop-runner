#!/usr/bin/env bash
#
# scripts/teardown-code-engine.sh
#
# Idempotently remove IBM Cloud Code Engine resources created for sample FVT.
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
#   ./scripts/teardown-code-engine.sh

set -euo pipefail

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-samples-fvt}"
JOB_NAME="${CE_JOB_NAME:-sample-fvt-job}"

echo "[teardown-code-engine] Target region: ${REGION}"
echo "[teardown-code-engine] Resource group: ${RESOURCE_GROUP}"
echo "[teardown-code-engine] Project: ${PROJECT_NAME}"
echo "[teardown-code-engine] Job: ${JOB_NAME}"

if ! command -v ibmcloud > /dev/null 2>&1; then
  echo "[teardown-code-engine] ERROR: ibmcloud CLI not found." >&2
  exit 1
fi

ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null
ibmcloud ce project select --name "${PROJECT_NAME}"

if ibmcloud ce job get --name "${JOB_NAME}" > /dev/null 2>&1; then
  echo "[teardown-code-engine] Deleting job: ${JOB_NAME}"
  ibmcloud ce job delete --name "${JOB_NAME}" --force
else
  echo "[teardown-code-engine] Job not found, skipping: ${JOB_NAME}"
fi

echo "[teardown-code-engine] Done."
