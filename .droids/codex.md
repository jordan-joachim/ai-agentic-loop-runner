---
name: codex
model: openrouter/free-router
---

# Codex Runtime (OpenRouter Free Router)

This Codex configuration file drives the DOER, REVIEWER, setup, and teardown
agents for the AI agentic loop harness using the Codex CLI routed through the
OpenRouter free router.

## Model

- Use the OpenRouter free router: `openrouter/free-router`.
- The free router automatically selects the best available free model.
- See https://openrouter.ai/docs/guides/routing/routers/free-router for details.

## Required credentials

- `CODEX_API_KEY` — API key for Codex authentication. When routing through
  OpenRouter, set this to your OpenRouter API key.
- `OPENROUTER_API_KEY` — API key for the OpenRouter provider. Required when
  using the OpenRouter free router.

Both credentials are provided at run time via environment variables only.
Never commit real credentials to the repository.

## Optional overrides

- `CODEX_MODEL` — override the default `openrouter/free-router` model with a
  specific model identifier (e.g. `openrouter/anthropic/claude-sonnet-4`).

## DOER

- **Role**: implement the plan for each iteration.
- **Prompt**: read the plan file provided by the harness for full task
  instructions.
- **Working directory**: the harness workspace output directory for the current
  iteration.
- **Rules**:
  - Only modify files under the configured sample directories and the current
    sample output directory.
  - Infer the test framework from `package.json` or `requirements.txt`.
  - Add focused tests that exercise uncovered code paths.
  - Run the test suite with coverage and produce `coverage.json`.
  - Stop when coverage is 100% or improvement between iterations is <= 5%.
  - Never commit credentials.

## REVIEWER

- **Role**: compare the current `coverage.json` against the previous iteration
  and against the plan's completion criteria.
- **Output**: write `review.yaml` with:
  - `status`: `done` or `incomplete`
  - `coverage_percent`: current lines coverage percentage
  - `coverage_delta_percent`: improvement since previous iteration
  - `gaps`: list of remaining uncovered areas
- **Done conditions**:
  - coverage_percent >= 100, or
  - coverage_delta_percent <= 5
- **Rules**:
  - Use `lines` coverage as the primary metric.
  - Be precise about files and uncovered branches or functions.

## Setup / Teardown

- **setup role**: capture baseline state, including a `starting-summary.md`
  output, and prepare the workspace for the execute loop.
- **teardown role**: compare final results to the starting summary, explain why
  the loop finished, and write a `final-summary.md` output.

## Required environment variables

- `HARNESS_AGENT_RUNTIME=codex` — select the Codex runtime.
- `CODEX_API_KEY` — API key for Codex (typically your OpenRouter API key).
- `OPENROUTER_API_KEY` — API key for the OpenRouter provider.
- `CODEX_MODEL` — (optional) override the default `openrouter/free-router` model.
