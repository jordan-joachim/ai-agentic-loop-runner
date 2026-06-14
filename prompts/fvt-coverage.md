# FVT Coverage Plan

This document serves as the `plan.yaml` content for the Agentic Harness. It
instructs the DOER and REVIEWER agents to download the IBM CodeEngine
samples/ai repository and run a coverage-driven FVT loop over every sample
project.

---

## Goal

Achieve the highest feasible functional verification test (FVT) line coverage
for every sample under `samples/ai/` in the IBM CodeEngine repository.

**Measurable goal:** `coverage_percent >= 100` for each sample, or stop when
the per-sample improvement between consecutive iterations is 5% or less.

---

## DOER Instructions

You are the DOER agent. Your job is to implement the plan: download the
repository, discover sample projects, write or extend FVT tests, and produce
coverage reports.

### 1. Download the IBM CodeEngine samples/ai repository

Clone the IBM CodeEngine samples repository from GitHub:

```bash
git clone https://github.com/IBM/CodeEngine.git inputs/code-engine-samples
```

If the repository is already present at `inputs/code-engine-samples/` (e.g.,
bind-mounted by the harness), verify it is a valid git clone and skip the
download step.

### 2. Discover sample projects

List all subdirectories under `inputs/code-engine-samples/samples/ai/`. Each
subdirectory is one sample project.

For each sample, determine the language and test framework:

- If `package.json` exists, the sample is Node.js. Prefer `vitest`, then
  `c8`, then `nyc` based on `devDependencies`/`dependencies`.
- If `requirements.txt` exists, the sample is Python. Prefer `pytest-cov`,
  then `coverage`.
- If neither exists but the directory contains source files (`.js`, `.ts`,
  `.py`, `.go`, `.java`, `.rb`, `.rs`, `.c`, `.cpp`, `.h`, `.sh`), mark the
  language as `unknown` and attempt to infer a test framework from the source
  files.
- Skip directories that contain no recognizable project files.

### 3. Install dependencies

- For Node.js samples with a `package.json`: run `npm install`.
- For Python samples with a `requirements.txt`: run
  `pip install -r requirements.txt`.

### 4. Write or extend FVT tests

Read the existing source files and tests for each sample. Add focused tests
that exercise currently uncovered code paths.

- Keep tests in the same language and framework as the sample.
- Do not modify application source code unless it is strictly necessary to
  make it testable; prefer adding tests.
- Place new test files alongside existing tests, following the sample's
  conventions.

### 5. Run tests with coverage and produce `coverage.json`

Use the detected framework to run the tests and emit coverage. Extract the
coverage percentages for `lines`, `statements`, `functions`, and `branches`.
Write the extracted metrics to the sample output directory as `coverage.json`.

Example `coverage.json` structure:

```json
{
  "lines": { "total": 120, "covered": 96, "percent": 80.0 },
  "statements": { "total": 130, "covered": 104, "percent": 80.0 },
  "functions": { "total": 15, "covered": 12, "percent": 80.0 },
  "branches": { "total": 40, "covered": 28, "percent": 70.0 },
  "timestamp": "2026-06-14T12:00:00Z",
  "sampleName": "example-sample",
  "iteration": 1
}
```

### 6. Loop until done or stalled

After producing `coverage.json`, hand off to the REVIEWER. If the REVIEWER
signals `incomplete`, return to step 4 for the next iteration. Continue until
the REVIEWER signals `done` or the maximum iteration limit is reached.

---

## REVIEWER Instructions

You are the REVIEWER agent. Your job is to compare the current iteration's
coverage against the previous iteration and decide whether the loop should
continue.

### 1. Read the current coverage report

Load `coverage.json` from the sample output directory. The primary metric for
comparison is **lines** coverage percentage.

### 2. Compare with the previous iteration

If a previous `coverage.json` exists (from the prior iteration), compute the
coverage delta:

```
delta = current_coverage_percent - previous_coverage_percent
```

On the first iteration, treat the previous coverage as 0%.

### 3. Decide: done or incomplete

Signal `done` when **either** condition is met:

- **CC-001 (Threshold reached):** `coverage_percent >= 100`
- **CC-002 (Coverage stalled):** `coverage_delta_percent <= 5`

Otherwise, signal `incomplete`.

### 4. Write `review.yaml`

Write a review file to the sample output directory with the following
structure:

```yaml
status: done | incomplete
coverage_percent: <number>
coverage_delta_percent: <number>
gaps:
  - "lines: 80% covered (24 of 120 uncovered)"
  - "branches: 70% covered (12 of 40 uncovered)"
iteration: <number>
sample_name: <string>
```

### 5. List uncovered areas as gaps

When signaling `done` due to stall (not 100%), include a clear list of
remaining uncovered areas. Each gap should name the metric and the uncovered
count.

When signaling `incomplete`, list every metric below 100% as a gap.

When signaling `done` at 100%, the gaps list is empty.

---

## Completion Criteria

| ID      | Description                  | Test                        |
|---------|------------------------------|-----------------------------|
| CC-001  | Coverage reaches 100%        | `coverage_percent >= 100`   |
| CC-002  | Coverage improvement stalls  | `coverage_delta_percent <= 5` |

---

## Output Files

For each sample, the loop produces:

- `coverage.json` — coverage metrics as JSON (written by DOER).
- `review.yaml` — reviewer decision with status and gaps (written by REVIEWER).

The harness aggregates per-sample results into a final `result.yaml` at the
workspace root.

---

## Model selection metadata

The harness can use multiple Ollama models for different roles or tasks. Provide
the list as a comma-separated string in the plan metadata or inputs. The first
model is the default DOER model. Subsequent models may be assigned to specific
tasks, for example the REVIEWER, or kept as a pool for parallel work.

```yaml
meta:
  ollama_models: "codellama:7b,llama3.1:8b"
```

or

```yaml
inputs:
  - name: ollama_models
    type: string
    value: "codellama:7b,llama3.1:8b"
```

Suggested convention for assigning models to tasks:

- **DOER** — first model in the list (e.g. `codellama:7b`). Used to implement
the FVT coverage plan and write tests.
- **REVIEWER** — second model in the list (e.g. `llama3.1:8b`). Used to compare
`coverage.json` against the previous iteration and decide whether the loop is
done or stalled.
- **Additional tasks** — further models may be used for other specialized
roles such as planning, summarizing, or auditing.

The shell scripts also read the environment variable `OLLAMA_MODELS`. For
backwards compatibility, the deprecated `OLLAMA_MODEL` environment variable is
accepted as a fallback when `OLLAMA_MODELS` is not set.

## PR creation metadata

If you want the harness to open a GitHub pull request with the FVT changes,
fill the following fields in the plan metadata or inputs:

```yaml
meta:
  github_repo: "owner/code-engine-samples"
  github_base_branch: "master"
```

or

```yaml
inputs:
  - name: github_repo
    type: string
    value: "owner/code-engine-samples"
  - name: github_base_branch
    type: string
    value: "master"
```

When `github_repo` and `github_base_branch` are not provided, the harness
falls back to the optional `GITHUB_REPO` and `GITHUB_BASE_BRANCH` environment
variables. If those are also unset, it derives the repository from the git
origin remote of the mounted samples directory and defaults the base branch to
`master`.

## Rules

- Never commit credentials or secrets.
- Only use environment variables for credentials.
- Do not modify files outside the sample output directory and the downloaded
  samples directory.
- The DOER must not evaluate its own work; the REVIEWER is the sole arbiter
  of completion.
- Each iteration must produce both `coverage.json` and `review.yaml` before
  the next iteration begins.
