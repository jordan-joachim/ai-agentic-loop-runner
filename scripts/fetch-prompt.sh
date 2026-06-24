#!/usr/bin/env bash
# fetch-prompt.sh — resolve a PROMPT_SOURCE and generate plan.yaml + rules.yaml
#                   into a workspace directory.
#
# Usage:
#   ./scripts/fetch-prompt.sh <workspace-dir>
#
# Environment variables:
#   PROMPT_SOURCE         Prompt source (required when called; see formats below).
#   PROMPT_GENERATE_PLAN  Override path to generate-plan.js (optional).
#
# Supported PROMPT_SOURCE formats:
#   fvt-coverage                          bare name → ../ai-agentic-loop-prompts/<name>/
#   dir:/path/to/prompt-package/          local directory
#   file:/path/to/my-prompt.md            single Markdown file
#   github:<owner>/<repo>[/<sub>][@<ref>] GitHub repo with optional subfolder and ref
#
# On success:
#   <workspace-dir>/plan.yaml and <workspace-dir>/rules.yaml are written.
#   Exit code 0.
#
# On failure:
#   A clear error message is printed to stderr.
#   Exit code 1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROMPTS_REPO="${RUNNER_ROOT}/../ai-agentic-loop-prompts"

log()   { echo "[fetch-prompt] $*"; }
error() { echo "[fetch-prompt] ERROR: $*" >&2; }

# ---- Args ----
if [ $# -lt 1 ]; then
  error "Usage: fetch-prompt.sh <workspace-dir>"
  exit 1
fi
WORKSPACE_DIR="$(cd "$1" && pwd 2>/dev/null || { mkdir -p "$1" && cd "$1" && pwd; })"

# ---- Require PROMPT_SOURCE ----
if [ -z "${PROMPT_SOURCE:-}" ]; then
  error "PROMPT_SOURCE is not set. Set it to a bare name, dir:, file:, or github: source."
  exit 1
fi

SRC="${PROMPT_SOURCE}"
PROMPT_FILE=""
PROMPT_DIR=""
TMP_DIR=""

# ---- Cleanup trap ----
cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

# ---- Parse PROMPT_SOURCE ----

if [[ "${SRC}" == github:* ]]; then
  # github:<owner>/<repo>[/<subfolder>][@<ref>]
  rest="${SRC#github:}"
  # Split off optional @ref
  ref=""
  if [[ "${rest}" == *@* ]]; then
    ref="${rest##*@}"
    rest="${rest%@*}"
  fi
  # rest is now owner/repo[/subfolder]
  IFS='/' read -r gh_owner gh_repo gh_sub <<< "${rest}/"
  gh_sub="${gh_sub%/}"   # strip trailing slash artifact

  REPO_URL="https://github.com/${gh_owner}/${gh_repo}.git"
  TMP_DIR="$(mktemp -d)"
  log "Sparse-cloning ${REPO_URL}${gh_sub:+ (subfolder: ${gh_sub})}${ref:+ @${ref}} ..."

  if [ -n "${gh_sub}" ]; then
    git clone --depth=1 --filter=blob:none --sparse \
      ${ref:+--branch "${ref}"} \
      "${REPO_URL}" "${TMP_DIR}" 2>/dev/null
    git -C "${TMP_DIR}" sparse-checkout set "${gh_sub}" 2>/dev/null
    PROMPT_DIR="${TMP_DIR}/${gh_sub}"
  else
    git clone --depth=1 --filter=blob:none \
      ${ref:+--branch "${ref}"} \
      "${REPO_URL}" "${TMP_DIR}" 2>/dev/null
    PROMPT_DIR="${TMP_DIR}"
  fi

elif [[ "${SRC}" == dir:* ]]; then
  # dir:/path/to/package
  raw="${SRC#dir:}"
  if [ ! -d "${raw}" ]; then
    error "Directory not found: ${raw}"
    exit 1
  fi
  PROMPT_DIR="$(cd "${raw}" && pwd)"

elif [[ "${SRC}" == file:* ]]; then
  # file:/path/to/prompt.md
  raw="${SRC#file:}"
  if [ ! -f "${raw}" ]; then
    error "File not found: ${raw}"
    exit 1
  fi
  PROMPT_FILE="$(cd "$(dirname "${raw}")" && pwd)/$(basename "${raw}")"

else
  # Bare name → sibling prompts repo
  BARE_NAME="${SRC}"
  CANDIDATE="${PROMPTS_REPO}/${BARE_NAME}"
  if [ ! -d "${CANDIDATE}" ]; then
    error "Prompt '${BARE_NAME}' not found at ${CANDIDATE}"
    error "Expected ai-agentic-loop-prompts repo at ${PROMPTS_REPO}"
    exit 1
  fi
  PROMPT_DIR="$(cd "${CANDIDATE}" && pwd)"
fi

# ---- Locate prompt .md file ----
if [ -z "${PROMPT_FILE}" ]; then
  # Infer name from last path component of PROMPT_DIR
  PROMPT_NAME="$(basename "${PROMPT_DIR}")"
  CANDIDATE_MD="${PROMPT_DIR}/prompts/${PROMPT_NAME}.md"
  if [ -f "${CANDIDATE_MD}" ]; then
    PROMPT_FILE="${CANDIDATE_MD}"
  else
    # Fall back: single .md file in prompts/
    shopt -s nullglob
    md_files=("${PROMPT_DIR}/prompts/"*.md)
    shopt -u nullglob
    if [ "${#md_files[@]}" -eq 1 ]; then
      PROMPT_FILE="${md_files[0]}"
    elif [ "${#md_files[@]}" -gt 1 ]; then
      error "Multiple .md files found in ${PROMPT_DIR}/prompts/ — set PROMPT_SOURCE=file: to specify one."
      exit 1
    else
      error "No prompt .md file found under ${PROMPT_DIR}/prompts/"
      exit 1
    fi
  fi
fi

log "Prompt file: ${PROMPT_FILE}"

# ---- Locate generate-plan.js ----
GENERATE_PLAN="${PROMPT_GENERATE_PLAN:-}"

if [ -z "${GENERATE_PLAN}" ]; then
  # Prefer generate-plan.js in the prompt package's scripts/ directory
  if [ -n "${PROMPT_DIR}" ] && [ -f "${PROMPT_DIR}/scripts/generate-plan.js" ]; then
    GENERATE_PLAN="${PROMPT_DIR}/scripts/generate-plan.js"
  elif [ -f "${PROMPTS_REPO}/fvt-coverage/scripts/generate-plan.js" ]; then
    # Fall back to the known location in the sibling prompts repo
    GENERATE_PLAN="${PROMPTS_REPO}/fvt-coverage/scripts/generate-plan.js"
    log "Using fallback generate-plan.js from sibling prompts repo"
  else
    error "generate-plan.js not found. Set PROMPT_GENERATE_PLAN to the path of generate-plan.js."
    exit 1
  fi
fi

log "Generator: ${GENERATE_PLAN}"

# ---- Ensure node and js-yaml are available for generate-plan.js ----
if ! command -v node > /dev/null 2>&1; then
  error "node is required but not found on PATH. Install Node.js 22 LTS."
  exit 1
fi

# Install js-yaml in the prompt package directory if needed
if [ -n "${PROMPT_DIR}" ] && [ -f "${PROMPT_DIR}/package.json" ]; then
  if [ ! -d "${PROMPT_DIR}/node_modules/js-yaml" ]; then
    log "Installing prompt package dependencies in ${PROMPT_DIR} ..."
    (cd "${PROMPT_DIR}" && npm install --silent 2>/dev/null)
  fi
fi

# ---- Generate plan.yaml + rules.yaml ----
mkdir -p "${WORKSPACE_DIR}"
PLAN_FILE="${WORKSPACE_DIR}/plan.yaml"
RULES_FILE="${WORKSPACE_DIR}/rules.yaml"

log "Generating ${PLAN_FILE} ..."
node --no-warnings "${GENERATE_PLAN}" "${PROMPT_FILE}" "${PLAN_FILE}" "${RULES_FILE}"

log "plan.yaml and rules.yaml written to ${WORKSPACE_DIR}"
