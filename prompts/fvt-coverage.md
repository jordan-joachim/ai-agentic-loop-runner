# FVT Coverage Plan

You are acting as a DOER agent for the Agentic Harness. Your mission is to
increase functional verification test (FVT) coverage for the IBM Code Engine
AI samples.

## Context

The IBM Code Engine samples repository is mounted inside the harness
workspace at:

```text
inputs/code-engine-samples/
```

This path is already present when the harness mounts the repo; do not clone it
yourself unless it is missing.

## Goal

Achieve the highest feasible FVT line coverage for every sample under
`samples/ai/` in the mounted repository. Stop when coverage reaches 100% or
when the per-sample improvement between consecutive iterations is 5% or less.

## Instructions

1. **Discover samples**
   - List all subdirectories under `inputs/code-engine-samples/samples/ai/`.
   - Each subdirectory is one sample project.

2. **Infer the test framework for each sample**
   - If `package.json` exists, read it. Prefer `vitest`, then `c8`, then `nyc`
     based on `devDependencies`/`dependencies`.
   - If `requirements.txt` exists, prefer `pytest-cov`, then `coverage`.

3. **Install dependencies if needed**
   - Run `npm install` for Node.js samples that have a `package.json`.
   - Run `pip install -r requirements.txt` for Python samples.

4. **Write or extend FVT tests to increase coverage**
   - Read the existing source files and tests for the sample.
   - Add focused tests that exercise currently uncovered code paths.
   - Keep tests in the same language and framework as the sample.
   - Do not modify application source code unless it is strictly necessary to
     make it testable; prefer adding tests.

5. **Run tests with coverage and produce `coverage.json`**
   - Use the detected framework to run the tests and emit coverage.
   - Extract the coverage percentages for `lines`, `statements`, `functions`, and
     `branches`.
   - Write the extracted metrics to the sample output directory as
     `coverage.json`.

6. **Review coverage and decide whether to continue**
   - Compare the current `coverage.json` with the previous iteration's
     `coverage.json`.
   - Signal completion for a sample when either:
     - coverage is 100%, or
     - the improvement from the previous iteration is 5% or less.
   - If neither condition is met, loop back to step 4 for that sample.

7. **List uncovered areas as gaps**
   - When stopping, include a clear list of remaining uncovered areas in the
     review output.
   - Each gap should name the file and, when possible, the uncovered function
     or branch.

## Completion criteria

- `CC-001`: Coverage for the sample reaches 100%.
- `CC-002`: Coverage improvement between iterations is 5% or less.

## Output files

For each sample write:

- `coverage.json` — coverage metrics as JSON.
- `review.yaml` — status (`done` or `incomplete`) and a list of remaining gaps.

## Rules

- Never commit credentials or secrets.
- Only use environment variables for credentials.
- Do not modify files outside the sample output directory and the mounted
  samples directory.
