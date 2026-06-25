#!/usr/bin/env bash
# run-direct.sh — run the harness CLI directly against a local workspace.
#
# Loads environment config from the runner root .env (if present), validates
# required variables, verifies the agent CLI is installed for non-mock
# runtimes, then invokes the harness CLI.
#
# Usage:
#   HARNESS_WORKSPACE=./workspace HARNESS_AGENT_RUNTIME=kilo KILO_API_KEY=... \
#     ./scripts/run-direct.sh
#
# Environment variables:
#   HARNESS_WORKSPACE          Path to the workspace directory (required)
#   HARNESS_AGENT_RUNTIME      Runtime selection: mock | droid | kilo | codex | bob-shell (required)
#   HARNESS_MAX_ITERATIONS     Optional iteration limit
#   HARNESS_TIME_LIMIT_MINUTES Optional time limit
#   KILO_API_KEY               Required when HARNESS_AGENT_RUNTIME=kilo
#   CODEX_API_KEY              Required when HARNESS_AGENT_RUNTIME=codex
#   OPENROUTER_API_KEY         Required when HARNESS_AGENT_RUNTIME=codex
#   BOBSHELL_API_KEY           Required when HARNESS_AGENT_RUNTIME=bob-shell

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"

log() {
  echo "[run-direct] $*"
}

error() {
  echo "[run-direct] ERROR: $*" >&2
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

# ---- Validate required env vars ----
if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  error "HARNESS_WORKSPACE is required"
  exit 1
fi

if [ -z "${HARNESS_AGENT_RUNTIME:-}" ]; then
  error "HARNESS_AGENT_RUNTIME is required (mock | droid | kilo | codex | bob-shell)"
  exit 1
fi

case "${HARNESS_AGENT_RUNTIME}" in
  mock|droid|kilo|codex|bob-shell)
    ;;
  *)
    error "Unsupported HARNESS_AGENT_RUNTIME: ${HARNESS_AGENT_RUNTIME}"
    error "Supported values: mock, droid, kilo, codex, bob-shell"
    exit 1
    ;;
esac

# ---- Validate workspace path ----
if [ ! -d "${HARNESS_WORKSPACE}" ]; then
  error "Workspace directory does not exist: ${HARNESS_WORKSPACE}"
  exit 1
fi
WORKSPACE_ABS="$(cd "${HARNESS_WORKSPACE}" && pwd)"

# ---- Validate harness CLI ----
HARNESS_BIN="${HARNESS_ROOT}/bin/harness"
if [ ! -f "${HARNESS_BIN}" ]; then
  error "harness CLI not found at ${HARNESS_BIN}"
  error "Run ./scripts/setup-direct.sh to verify the direct execution environment"
  exit 1
fi

# ---- Validate runtime-specific credentials ----
if [ "${HARNESS_AGENT_RUNTIME}" = "kilo" ]; then
  if [ -z "${KILO_API_KEY:-}" ]; then
    error "KILO_API_KEY is required for HARNESS_AGENT_RUNTIME=kilo"
    exit 1
  fi
fi

if [ "${HARNESS_AGENT_RUNTIME}" = "codex" ]; then
  if [ -z "${CODEX_API_KEY:-}" ]; then
    error "CODEX_API_KEY is required for HARNESS_AGENT_RUNTIME=codex"
    exit 1
  fi
  if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    error "OPENROUTER_API_KEY is required for HARNESS_AGENT_RUNTIME=codex"
    exit 1
  fi
fi

if [ "${HARNESS_AGENT_RUNTIME}" = "bob-shell" ]; then
  if [ -z "${BOBSHELL_API_KEY:-}" ]; then
    error "BOBSHELL_API_KEY is required for HARNESS_AGENT_RUNTIME=bob-shell"
    exit 1
  fi
fi

# ---- Check agent CLI presence for non-mock runtimes ----
if [ "${HARNESS_AGENT_RUNTIME}" != "mock" ]; then
  log "Checking agent CLI presence for runtime: ${HARNESS_AGENT_RUNTIME}"
  node -e "require('./dist/agent-cli-check').checkAgentCli(process.env.HARNESS_AGENT_RUNTIME)"
fi

# ---- Build env var arguments for the harness CLI ----
ENV_ARGS=()
if [ -n "${HARNESS_MAX_ITERATIONS:-}" ]; then
  ENV_ARGS+=( "HARNESS_MAX_ITERATIONS=${HARNESS_MAX_ITERATIONS}" )
fi
if [ -n "${HARNESS_TIME_LIMIT_MINUTES:-}" ]; then
  ENV_ARGS+=( "HARNESS_TIME_LIMIT_MINUTES=${HARNESS_TIME_LIMIT_MINUTES}" )
fi
if [ -n "${KILO_API_KEY:-}" ]; then
  ENV_ARGS+=( "KILO_API_KEY=${KILO_API_KEY}" )
fi
if [ -n "${CODEX_API_KEY:-}" ]; then
  ENV_ARGS+=( "CODEX_API_KEY=${CODEX_API_KEY}" )
fi
if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  ENV_ARGS+=( "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" )
fi
if [ -n "${BOBSHELL_API_KEY:-}" ]; then
  ENV_ARGS+=( "BOBSHELL_API_KEY=${BOBSHELL_API_KEY}" )
fi

# ---- Run the harness CLI ----
log "Running harness CLI directly with workspace ${WORKSPACE_ABS}"
log "Runtime: ${HARNESS_AGENT_RUNTIME}"
log "Harness: ${HARNESS_BIN}"

set +e
"${HARNESS_BIN}" --workspace "${WORKSPACE_ABS}" "${@}"
EXIT_CODE=$?
set -e

exit ${EXIT_CODE}

