#!/usr/bin/env bash
#
# scripts/setup-codeengine.sh
#
# Idempotently provision IBM Cloud Code Engine resources.
#
# Required environment variables:
#   IBMCLOUD_API_KEY      - IBM Cloud API key
#
# Optional environment variables:
#   IBMCLOUD_REGION       - target region (default: us-south)
#   CE_RESOURCE_GROUP     - resource group name (default: agenticloop)
#   CE_PROJECT_NAME       - Code Engine project name (default: agentic-loop-ce-project)
#   CE_JOB_NAME           - Code Engine job name (default: agentic-loop-harness-job)
#   CE_IMAGE              - container image to run (default: ai-agentic-loop-runner:latest)
#   COS_BUCKET            - COS bucket name (default: agentic-loop-harness-<random>)
#
# Usage:
#   export IBMCLOUD_API_KEY="your-api-key"
#   ./scripts/setup-codeengine.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Load optional .env from repo root unless disabled ----
if [ "${AGENTIC_NO_DOTENV:-false}" != "true" ] && [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agenticloop}"
REGION="${IBMCLOUD_REGION:-us-south}"
PROJECT_NAME="${CE_PROJECT_NAME:-agentic-loop-ce-project}"
JOB_NAME="${CE_JOB_NAME:-agentic-loop-harness-job}"
IMAGE="${CE_IMAGE:-ai-agentic-loop-runner:latest}"

# Generate a deterministic but unique bucket name when not provided.
if [ -z "${COS_BUCKET:-}" ]; then
  COS_BUCKET="agentic-loop-harness-$(date +%s)-${RANDOM}"
fi

COS_SERVICE_INSTANCE_NAME="${COS_SERVICE_INSTANCE_NAME:-agenticloop-cos}"
COS_SERVICE_ID_NAME="${COS_SERVICE_ID_NAME:-agentic-loop-harness-sa}"
CE_COS_SECRET_NAME="${CE_COS_SECRET_NAME:-agentic-loop-harness-cos-secret}"

log() {
  echo "[setup-codeengine] $*"
}

error() {
  echo "[setup-codeengine] ERROR: $*" >&2
}

# ---- Validate credentials ----
if [ -z "${IBMCLOUD_API_KEY:-}" ]; then
  error "IBMCLOUD_API_KEY is required"
  exit 1
fi

# ---- Rebuild linked harness package if symlink ----
HARNESS_PACKAGE_PATH="${REPO_ROOT}/node_modules/@agentic-loop/harness"
if [ -L "${HARNESS_PACKAGE_PATH}" ]; then
  HARNESS_REAL_PATH="$(readlink -f "${HARNESS_PACKAGE_PATH}")"
  log "Detected linked harness package at ${HARNESS_REAL_PATH}; building..."
  (cd "${HARNESS_REAL_PATH}" && npm run build)
  log "Harness package build complete"
else
  log "Harness package is not a symlink; skipping build"
fi

# ---- Ensure ibmcloud CLI is available ----
if ! command -v ibmcloud > /dev/null 2>&1; then
  error "ibmcloud CLI not found. Install from https://cloud.ibm.com/docs/cli"
  exit 1
fi

# ---- Login and target resource group ----
log "Logging in to IBM Cloud region ${REGION}, resource group ${RESOURCE_GROUP}..."
ibmcloud login --apikey "${IBMCLOUD_API_KEY}" -r "${REGION}" -g "${RESOURCE_GROUP}" > /dev/null

# ---- Ensure resource group exists ----
if ! ibmcloud resource group "${RESOURCE_GROUP}" > /dev/null 2>&1; then
  log "Creating resource group: ${RESOURCE_GROUP}"
  ibmcloud resource group-create "${RESOURCE_GROUP}" > /dev/null
else
  log "Resource group already exists: ${RESOURCE_GROUP}"
fi

# ---- Ensure Code Engine project exists ----
ibmcloud ce project select --name "${PROJECT_NAME}" > /dev/null 2>&1 || true
if ! ibmcloud ce project get --name "${PROJECT_NAME}" > /dev/null 2>&1; then
  log "Creating Code Engine project: ${PROJECT_NAME}"
  ibmcloud ce project create --name "${PROJECT_NAME}" > /dev/null
else
  log "Code Engine project already exists: ${PROJECT_NAME}"
fi

ibmcloud ce project select --name "${PROJECT_NAME}" > /dev/null

# ---- Ensure COS service instance exists ----
if ! ibmcloud resource service-instance "${COS_SERVICE_INSTANCE_NAME}" > /dev/null 2>&1; then
  log "Creating COS service instance: ${COS_SERVICE_INSTANCE_NAME}"
  ibmcloud resource service-instance-create "${COS_SERVICE_INSTANCE_NAME}" \
    cloud-object-storage standard global \
    -d premium-global-deployment-iam \
    -g "${RESOURCE_GROUP}" > /dev/null
  sleep 5
else
  log "COS service instance already exists: ${COS_SERVICE_INSTANCE_NAME}"
fi

# Wait for the COS service instance to become active
for _ in $(seq 1 30); do
  state="$(ibmcloud resource service-instance "${COS_SERVICE_INSTANCE_NAME}" --output json 2>/dev/null \
    | grep -o '"state": *"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [ "${state}" = "active" ]; then
    break
  fi
  sleep 5
done

# ---- Ensure COS bucket exists ----
cos_crn="$(ibmcloud resource service-instance "${COS_SERVICE_INSTANCE_NAME}" --output json 2>/dev/null \
  | grep -o '"crn": *"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
if [ -n "${cos_crn}" ]; then
  ibmcloud cos config set crn "${cos_crn}" --force > /dev/null 2>&1 || true
fi

if ! ibmcloud cos buckets --ibm-service-instance-id "${COS_SERVICE_INSTANCE_NAME}" --output json 2>/dev/null \
  | grep -q "\"${COS_BUCKET}\""; then
  log "Creating COS bucket: ${COS_BUCKET}"
  ibmcloud cos bucket-create --bucket "${COS_BUCKET}" \
    --ibm-service-instance-id "${COS_SERVICE_INSTANCE_NAME}" \
    --class standard \
    --region "${REGION}" > /dev/null
else
  log "COS bucket already exists: ${COS_BUCKET}"
fi

# ---- Ensure service ID exists ----
if ! ibmcloud iam service-id "${COS_SERVICE_ID_NAME}" > /dev/null 2>&1; then
  log "Creating service ID: ${COS_SERVICE_ID_NAME}"
  ibmcloud iam service-id-create "${COS_SERVICE_ID_NAME}" \
    -d "Service ID for agentic harness COS access" -q > /dev/null
else
  log "Service ID already exists: ${COS_SERVICE_ID_NAME}"
fi

# ---- Ensure IAM policy exists (Writer + Reader on COS) ----
sid_uuid="$(ibmcloud iam service-id "${COS_SERVICE_ID_NAME}" --uuid 2>/dev/null || true)"
existing_policies="$(ibmcloud iam service-policies "${COS_SERVICE_ID_NAME}" -q 2>/dev/null || true)"
cos_guid="$(ibmcloud resource service-instance "${COS_SERVICE_INSTANCE_NAME}" --output json 2>/dev/null \
  | grep -o '"guid": *"[^"]*"' | head -1 | cut -d'"' -f4 || true)"

if echo "${existing_policies}" | grep -q "cloud-object-storage.*Writer\|Writer.*cloud-object-storage"; then
  log "IAM policy for COS Writer/Reader already exists"
else
  writer_role_crn="crn:v1:bluemix:public:iam::::serviceRole:Writer"
  reader_role_crn="crn:v1:bluemix:public:iam::::serviceRole:Reader"
  if [ -n "${cos_guid}" ]; then
    log "Creating IAM policy scoped to COS instance ${cos_guid}"
    ibmcloud iam service-policy-create "${COS_SERVICE_ID_NAME}" \
      --roles "${writer_role_crn},${reader_role_crn}" \
      --service-name "cloud-object-storage" \
      --service-instance "${cos_guid}" -f -q > /dev/null
  else
    log "Creating IAM policy for cloud-object-storage"
    ibmcloud iam service-policy-create "${COS_SERVICE_ID_NAME}" \
      --roles "${writer_role_crn},${reader_role_crn}" \
      --service-name "cloud-object-storage" -f -q > /dev/null
  fi
fi

# ---- Ensure CE secret with HMAC credentials exists ----
if ! ibmcloud ce secret get --name "${CE_COS_SECRET_NAME}" > /dev/null 2>&1; then
  hmac_cred_name="${COS_SERVICE_ID_NAME}-hmac-cred"
  if ! ibmcloud resource service-key "${hmac_cred_name}" > /dev/null 2>&1; then
    log "Creating HMAC service credentials: ${hmac_cred_name}"
    ibmcloud resource service-key-create "${hmac_cred_name}" Writer \
      --instance-name "${COS_SERVICE_INSTANCE_NAME}" \
      --parameters '{"HMAC":true}' -q > /dev/null
  fi

  access_key="$(ibmcloud resource service-key "${hmac_cred_name}" --output json 2>/dev/null \
    | grep -o '"access_key_id": *"[^"]*"' | cut -d'"' -f4 || true)"
  secret_key="$(ibmcloud resource service-key "${hmac_cred_name}" --output json 2>/dev/null \
    | grep -o '"secret_access_key": *"[^"]*"' | cut -d'"' -f4 || true)"

  if [ -n "${access_key}" ] && [ -n "${secret_key}" ]; then
    log "Creating CE secret: ${CE_COS_SECRET_NAME}"
    ibmcloud ce secret create --name "${CE_COS_SECRET_NAME}" \
      --from-literal "ACCESS_KEY_ID=${access_key}" \
      --from-literal "SECRET_ACCESS_KEY=${secret_key}" > /dev/null
  else
    log "WARNING: could not extract HMAC credentials; secret not created"
  fi
else
  log "CE secret already exists: ${CE_COS_SECRET_NAME}"
fi

# ---- Ensure Code Engine job definition exists ----
if ibmcloud ce job get --name "${JOB_NAME}" > /dev/null 2>&1; then
  log "Code Engine job already exists: ${JOB_NAME}"
else
  cos_endpoint="s3.${REGION}.cloud-object-storage.appdomain.cloud"
  log "Creating Code Engine job: ${JOB_NAME}"
  ibmcloud ce job create \
    --name "${JOB_NAME}" \
    --image "${IMAGE}" \
    --cpu 1 \
    --memory 2G \
    --maxexecutiontime 1800 \
    --env "COS_BUCKET=${COS_BUCKET}" \
    --env "COS_ENDPOINT=https://${cos_endpoint}" \
    --env "HARNESS_MAX_ITERATIONS=1" \
    --env "HARNESS_TIME_LIMIT_MINUTES=10" \
    --env-from-secret "${CE_COS_SECRET_NAME}" > /dev/null
fi

log "Code Engine setup complete."
log "  Project:        ${PROJECT_NAME}"
log "  Resource group: ${RESOURCE_GROUP}"
log "  Region:         ${REGION}"
log "  Job:            ${JOB_NAME}"
log "  Image:          ${IMAGE}"
log "  COS bucket:     ${COS_BUCKET}"
log "  Service ID:     ${COS_SERVICE_ID_NAME}"
log "  CE secret:      ${CE_COS_SECRET_NAME}"
