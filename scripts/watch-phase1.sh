#!/usr/bin/env bash
#
# scripts/watch-phase1.sh
#
# Tail the Phase 1 workspace harness log and per-iteration agent logs.
#
# Usage:
#   ./scripts/watch-phase1.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="${REPO_ROOT}/workspace"

if [ ! -d "${WORKSPACE_DIR}" ]; then
  echo "[watch-phase1] Workspace does not exist: ${WORKSPACE_DIR}" >&2
  exit 1
fi

cd "${WORKSPACE_DIR}"
tail -f "${WORKSPACE_DIR}/harness.log" "${WORKSPACE_DIR}"/iter-*/doer-*.log "${WORKSPACE_DIR}"/iter-*/reviewer-*.log 2>/dev/null
