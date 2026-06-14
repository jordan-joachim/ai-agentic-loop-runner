# Ollama Droid Configuration

This Droid configuration file drives the DOER and REVIEWER agents for the FVT
coverage task using an Ollama backend.

## DOER

- **Role**: implement the FVT coverage plan for each IBM Code Engine AI sample.
- **Prompt**: read `prompts/fvt-coverage.md` for the full task instructions.
- **Model**: use the first model in `OLLAMA_MODELS` (e.g. `codellama:7b`) for the DOER role and additional models for specific tasks such as REVIEWER.
- **Working directory**: the harness workspace output directory for the current
  iteration.
- **Rules**:
  - Only modify files under `inputs/code-engine-samples/samples/ai/` and the
    current sample output directory.
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

## Required environment variables

- `OLLAMA_HOST` — URL of the Ollama server, e.g. `http://localhost:11434`.
- `OLLAMA_MODELS` — comma-separated list of model tags to use, e.g. `codellama:7b,llama3.1:8b`. The first model is the default DOER model; additional models may be assigned to the REVIEWER or other specific tasks.
- `OLLAMA_MODEL` — (deprecated) single model tag. Accepted as a fallback when `OLLAMA_MODELS` is not set.
- `OLLAMA_API_KEY` — API key for the Ollama server, if authentication is required.
- `DROID_DOER_CONFIG` — path to this file for the DOER invocation (optional).
- `DROID_REVIEWER_CONFIG` — path to this file for the REVIEWER invocation
  (optional).
