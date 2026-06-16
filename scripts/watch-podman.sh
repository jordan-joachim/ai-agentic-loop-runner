#!/usr/bin/env bash
#
# scripts/watch-podman.sh
#
# Watch the running Podman container and the workspace agent logs inside it.
#
# Usage:
#   ./scripts/watch-podman.sh

set -euo pipefail

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

podman exec agentic-loop-fvt sh -c 'tail -f /workspace/harness.log /workspace/iter-*/doer-*.log /workspace/iter-*/reviewer-*.log' &
AGENT_LOGS_PID=$!

wait -n ${PODMAN_LOGS_PID} ${AGENT_LOGS_PID}
