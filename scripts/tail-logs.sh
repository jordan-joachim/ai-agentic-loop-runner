#!/usr/bin/env bash
#
# scripts/tail-logs.sh
#
# Tail the workspace harness log and per-iteration agent logs inside the
# running Podman container started by run-local-podman.sh.

set -euo pipefail

podman exec agentic-loop-fvt sh -c 'tail -f /workspace/harness.log /workspace/iteration-*/doer-*.log /workspace/iteration-*/reviewer-*.log 2>/dev/null'
