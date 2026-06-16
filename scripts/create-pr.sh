#!/usr/bin/env bash
#
# scripts/create-pr.sh
#
# Idempotently commit FVT test changes in the workspace and open a GitHub pull
# request. All credentials are read from environment variables; nothing is
# committed to the example repository itself.
#
# Required environment variables:
#   GITHUB_TOKEN   - GitHub token with repo and workflow scopes
#
# Target repository / base branch resolution (in order of precedence):
#   1. The active plan.yaml under <workspace>/result.yaml or a sample plan
#      (meta.github_repo / inputs.github_repo and
#       meta.github_base_branch / inputs.github_base_branch).
#   2. Optional environment variables GITHUB_REPO and GITHUB_BASE_BRANCH.
#   3. Git remote of the mounted samples repo: owner/repo derived from
#      `git remote get-url origin` and base branch defaulting to `master`.
#
# Optional environment variables:
#   GITHUB_REPO      - Target repository slug, e.g. "owner/repo"
#   GITHUB_BASE_BRANCH - Base branch for the PR (default: master)
#   GIT_USER_NAME    - Git commit author name (default: Agentic Harness)
#   GIT_USER_EMAIL   - Git commit author email (default: agentic-harness@example.local)
#
# Usage:
#   ./scripts/create-pr.sh <workspace-path>

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

if [ $# -lt 1 ]; then
  echo "[create-pr] ERROR: workspace path argument is required." >&2
  echo "[create-pr] Usage: $0 <workspace-path>" >&2
  exit 1
fi

WORKSPACE_PATH="$1"

# Validate required credentials
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "[create-pr] ERROR: GITHUB_TOKEN environment variable is required." >&2
  exit 1
fi

if [ ! -d "${WORKSPACE_PATH}" ]; then
  echo "[create-pr] ERROR: workspace path does not exist: ${WORKSPACE_PATH}" >&2
  exit 1
fi

GIT_USER_NAME="${GIT_USER_NAME:-Agentic Harness}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-agentic-harness@example.local}"

# Look for the samples repository inside the workspace
SAMPLES_DIR="${WORKSPACE_PATH}/inputs/code-engine-samples"
if [ ! -d "${SAMPLES_DIR}" ]; then
  echo "[create-pr] No samples repo found at ${SAMPLES_DIR}; nothing to commit."
  exit 0
fi

# Idempotent: only proceed when there are changes to commit
if [ -z "$(git -C "${SAMPLES_DIR}" status --porcelain 2>/dev/null || true)" ]; then
  echo "[create-pr] No FVT changes to commit in ${SAMPLES_DIR}."
  exit 0
fi

# Resolve target repository and base branch from plan > env > git remote
resolve_repo_and_branch() {
  local repo=""
  local branch=""

  # 1. Try to read from plan files (aggregate or per-sample)
  if [ -f "${WORKSPACE_PATH}/result.yaml" ]; then
    repo="$(grep -E '^\s*github_repo:\s*' "${WORKSPACE_PATH}/result.yaml" | head -n1 | sed -E 's/^\s*github_repo:\s*//; s/[[:space:]]*$//' || true)"
    branch="$(grep -E '^\s*github_base_branch:\s*' "${WORKSPACE_PATH}/result.yaml" | head -n1 | sed -E 's/^\s*github_base_branch:\s*//; s/[[:space:]]*$//' || true)"
  fi

  if [ -z "${repo}" ] || [ -z "${branch}" ]; then
    local plan_file
    plan_file="$(find "${WORKSPACE_PATH}" -maxdepth 3 -name 'plan.yaml' -print -quit 2>/dev/null || true)"
    if [ -n "${plan_file}" ]; then
      if [ -z "${repo}" ]; then
        repo="$(grep -E '^\s*github_repo:\s*' "${plan_file}" | head -n1 | sed -E 's/^\s*github_repo:\s*//; s/[[:space:]]*$//' || true)"
      fi
      if [ -z "${branch}" ]; then
        branch="$(grep -E '^\s*github_base_branch:\s*' "${plan_file}" | head -n1 | sed -E 's/^\s*github_base_branch:\s*//; s/[[:space:]]*$//' || true)"
      fi
    fi
  fi

  # 2. Fall back to environment variables
  if [ -z "${repo}" ]; then
    repo="${GITHUB_REPO:-}"
  fi
  if [ -z "${branch}" ]; then
    branch="${GITHUB_BASE_BRANCH:-}"
  fi

  # 3. Derive from git remote and default branch
  if [ -z "${repo}" ]; then
    local remote_url
    remote_url="$(git -C "${SAMPLES_DIR}" remote get-url origin 2>/dev/null || true)"
    if [ -n "${remote_url}" ]; then
      # Convert SSH or HTTPS URL to owner/repo
      repo="$(echo "${remote_url}" | sed -E 's#^(git@|https?://)([^:/]+)[:/]([^/]+)/([^/]+)(\.git)?$#\3/\4#')"
    fi
  fi
  if [ -z "${branch}" ]; then
    branch="master"
  fi

  printf '%s\t%s\n' "${repo}" "${branch}"
}

resolved="$(resolve_repo_and_branch)"
GITHUB_REPO="$(printf '%s' "${resolved}" | cut -f1)"
GITHUB_BASE_BRANCH="$(printf '%s' "${resolved}" | cut -f2)"

if [ -z "${GITHUB_REPO}" ]; then
  echo "[create-pr] ERROR: could not determine target repository. Set GITHUB_REPO, provide github_repo in the plan, or mount a samples repo with a valid origin remote." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH_NAME="agentic-loop-fvt-${TIMESTAMP}"

# Configure git user for this repo
git -C "${SAMPLES_DIR}" config user.name "${GIT_USER_NAME}"
git -C "${SAMPLES_DIR}" config user.email "${GIT_USER_EMAIL}"

# Create branch and commit FVT changes
git -C "${SAMPLES_DIR}" checkout -b "${BRANCH_NAME}"
git -C "${SAMPLES_DIR}" add -A
git -C "${SAMPLES_DIR}" commit -m "feat(fvt): agentic harness FVT coverage improvements [${TIMESTAMP}]"

# Push to origin using the token over HTTPS
REMOTE_URL="*************************************************/${GITHUB_REPO}.git"
git -C "${SAMPLES_DIR}" push "${REMOTE_URL}" "${BRANCH_NAME}"

# Open the pull request
PR_TITLE="feat: agentic-loop FVT coverage improvements"
PR_BODY="Automated FVT coverage improvements generated by the Agentic Harness.

- Discovers samples in inputs/code-engine-samples/samples/ai/
- Infers test frameworks from package.json/requirements.txt
- Adds or extends FVT tests to increase line coverage
- Stops when coverage reaches 100% or improvement stalls at <= 5%
"

if command -v gh > /dev/null 2>&1; then
  # Use GitHub CLI if available
  GH_TOKEN="${GITHUB_TOKEN}" gh pr create \
    --repo "${GITHUB_REPO}" \
    --title "${PR_TITLE}" \
    --body "${PR_BODY}" \
    --head "${BRANCH_NAME}" \
    --base "${GITHUB_BASE_BRANCH}"
else
  # Fallback to curl against the GitHub REST API
  curl -sS -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/pulls" \
    -d "$(printf '{"title":"%s","body":"%s","head":"%s","base":"%s"}' \
      "${PR_TITLE}" \
      "${PR_BODY//$'\n'/\\n}" \
      "${BRANCH_NAME}" \
      "${GITHUB_BASE_BRANCH}")"
fi

echo "[create-pr] Pull request created from branch ${BRANCH_NAME} to ${GITHUB_REPO}:${GITHUB_BASE_BRANCH}."
