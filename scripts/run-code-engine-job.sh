#!/usr/bin/env bash
#
# scripts/run-code-engine-job.sh
#
# Thin wrapper: resolves PROMPT_SOURCE, validates agent config, writes
# workspace/config/agents.json, then delegates to the harness run-code-engine-job.sh
# script to upload plan inputs to COS and submit a Code Engine job run.
#
# Required environment variables:
#   IBMCLOUD_API_KEY       - IBM Cloud API key
#   COS_BUCKET             - COS bucket name
#   HARNESS_AGENT_RUNTIME  - Agent runtime selection
#
# Optional environment variables: see harness scripts/run-code-engine-job.sh
# Key defaults: CE_RESOURCE_GROUP=agentic-loop, CE_PROJECT_NAME=agentic-loop-job
#
# Usage:
#   export IBMCLOUD_API_KEY="..."
#   export COS_BUCKET="agentic-loop-job-<timestamp>"
#   export HARNESS_AGENT_RUNTIME="mock"
#   ./scripts/run-code-engine-job.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log() {
  echo "[run-code-engine-job] $*"
}

error() {
  echo "[run-code-engine-job] ERROR: $*" >&2
}

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
  log "PROMPT_SOURCE=${PROMPT_SOURCE} — fetching prompt ..."
  PROMPT_SOURCE="${PROMPT_SOURCE}" \
  PROMPT_GENERATE_PLAN="${PROMPT_GENERATE_PLAN:-}" \
    bash "${SCRIPT_DIR}/fetch-prompt.sh" "${WORKSPACE_DIR}"
fi

# ---- Resolve workspace path ----
WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
if [ ! -d "${WORKSPACE_DIR}" ]; then
  error "Workspace directory does not exist: ${WORKSPACE_DIR}"
  error "Set HARNESS_WORKSPACE_DIR to an existing workspace directory."
  exit 1
fi
WORKSPACE_ABS="$(cd "${WORKSPACE_DIR}" && pwd)"

# ---- Validate agent runtime ----
if [ -z "${HARNESS_AGENT_RUNTIME:-}" ]; then
  error "HARNESS_AGENT_RUNTIME is required (mock | droid | kilo | codex | bob-shell)"
  exit 1
fi

# ---- Validate agent config and write workspace/config/agents.json ----
log "Validating agent config: runtime=${HARNESS_AGENT_RUNTIME} backend=${HARNESS_AGENT_BACKEND:-default}"
node -e "require('${RUNNER_ROOT}/dist/agent-config').validateAgentConfig(process.env.HARNESS_AGENT_RUNTIME, process.env.HARNESS_AGENT_BACKEND, process.env)"
node -e "require('${RUNNER_ROOT}/dist/agent-config').writeAgentsJson('${WORKSPACE_ABS}', require('${RUNNER_ROOT}/dist/agent-config').buildAgentConfig(process.env.HARNESS_AGENT_RUNTIME, process.env.HARNESS_AGENT_BACKEND, process.env.HARNESS_AGENT_MODEL, process.env))"
log "Wrote workspace/config/agents.json"

HARNESS_SCRIPT="${HARNESS_ROOT}/scripts/run-code-engine-job.sh"

if [ ! -f "${HARNESS_SCRIPT}" ]; then
  error "harness script not found: ${HARNESS_SCRIPT}"
  error "Expected harness repo at ../ai-agentic-loop-harness"
  exit 1
fi

export CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-agentic-loop}"
export AGENTIC_NO_DOTENV=true

# ---- Point harness to the runner workspace ----
export PLAN_FILE="${WORKSPACE_ABS}/plan.yaml"
export RULES_FILE="${WORKSPACE_ABS}/rules.yaml"
export INPUTS_DIR="${WORKSPACE_ABS}/inputs"
export AGENTS_CONFIG_FILE="${WORKSPACE_ABS}/config/agents.json"

# ---- Print COS result retrieval hint ----
print_result_hint() {
  log ""
  log "After the job run completes, download results from COS:"
  if [ -n "${COS_PREFIX:-}" ]; then
    log "  ibmcloud cos object-get --bucket ${COS_BUCKET} --key ${COS_PREFIX}result.yaml --output result.yaml"
    log "  ibmcloud cos object-get --bucket ${COS_BUCKET} --key ${COS_PREFIX}harness.log --output harness.log"
  else
    log "  ibmcloud cos object-get --bucket ${COS_BUCKET} --key result.yaml --output result.yaml"
    log "  ibmcloud cos object-get --bucket ${COS_BUCKET} --key harness.log --output harness.log"
  fi
}

# Run the harness script, then print retrieval hint even if harness exits non-zero.
set +e
"${HARNESS_SCRIPT}" "$@"
EXIT_CODE=$?
set -e

print_result_hint

exit ${EXIT_CODE}
