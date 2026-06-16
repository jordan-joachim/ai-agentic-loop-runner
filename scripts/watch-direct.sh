#!/usr/bin/env bash
#
# scripts/watch-direct.sh
#
# Tail the direct workspace harness log and per-iteration agent logs.
#
# Usage:
#   ./scripts/watch-direct.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Load optional .env from repo root ----
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

HARNESS_WORKSPACE_DIR="${HARNESS_WORKSPACE_DIR:-workspace}"
WORKSPACE_DIR="${REPO_ROOT}/${HARNESS_WORKSPACE_DIR}"

if [ ! -d "${WORKSPACE_DIR}" ]; then
  echo "[watch-direct] Workspace does not exist: ${WORKSPACE_DIR}" >&2
  exit 1
fi

cd "${WORKSPACE_DIR}"
tail -f "${WORKSPACE_DIR}/harness.log" "${WORKSPACE_DIR}"/iter-*/doer-*.log "${WORKSPACE_DIR}"/iter-*/reviewer-*.log 2>/dev/null
