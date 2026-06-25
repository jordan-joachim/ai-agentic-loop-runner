#!/usr/bin/env bash
# setup-direct.sh — idempotent setup check for direct harness execution.
#
# Verifies the harness repository exists next to the runner and prints
# instructions for running the harness directly. Safe to run repeatedly.
#
# Usage:
#   ./scripts/setup-direct.sh

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log() {
  echo "[setup-direct] $*"
}

error() {
  echo "[setup-direct] ERROR: $*" >&2
}

# ---- Validate harness repo ----
if [ ! -d "${HARNESS_ROOT}" ]; then
  error "harness repository not found at ${HARNESS_ROOT}"
  error "Expected ai-agentic-loop-harness at ../ai-agentic-loop-harness relative to the runner repo"
  exit 1
fi

if [ ! -f "${HARNESS_ROOT}/bin/harness" ]; then
  error "harness CLI not found at ${HARNESS_ROOT}/bin/harness"
  error "Ensure the harness repo is built and contains bin/harness"
  exit 1
fi

log "Direct execution environment looks good."
log "Harness CLI: ${HARNESS_ROOT}/bin/harness"
log ""
log "Next steps:"
log "  1. Prepare a workspace directory with plan.yaml and rules.yaml (or set PROMPT_SOURCE)."
log "  2. Copy an agent config sample into workspace/config/agents.json if needed."
log "     Example: cp ../ai-agentic-loop-harness/agent-config-samples/kilo.json workspace/config/agents.json"
log "  3. Run the harness directly:"
log "     HARNESS_WORKSPACE=./workspace HARNESS_AGENT_RUNTIME=kilo KILO_API_KEY=... ./scripts/run-direct.sh"
