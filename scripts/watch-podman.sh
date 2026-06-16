#!/usr/bin/env bash
#
# scripts/watch-podman.sh
#
# Watch the running Podman container and the workspace agent logs inside it.
#
# Usage:
#   ./scripts/watch-podman.sh

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

HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"

if ! command -v podman > /dev/null 2>&1; then
  echo "[watch-podman] ERROR: podman is required but not found on PATH" >&2
  exit 1
fi

if ! podman container exists agentic-loop-fvt 2>/dev/null; then
  echo "[watch-podman] ERROR: container agentic-loop-fvt is not running" >&2
  exit 1
fi

# Start both tails in the background and wait for any of them to finish.
# shellcheck disable=SC2068
podman logs -f agentic-loop-fvt &
PODMAN_LOGS_PID=$!

podman exec agentic-loop-fvt sh -c "tail -f /workspace/harness.log /workspace/iter-*/doer-*.log /workspace/iter-*/reviewer-*.log" &
AGENT_LOGS_PID=$!

wait -n ${PODMAN_LOGS_PID} ${AGENT_LOGS_PID}
