# agentic-loop-codeengine-samples-example

Example repository demonstrating how to use the [Agentic Harness](https://github.com/factoryai/agentic-loop) to generate and run FVT tests for IBM Code Engine AI samples.

## Overview

This package consumes the `agentic-loop` harness and wires it to:

1. Discover IBM Code Engine AI sample projects under a samples directory.
2. Run coverage-driven FVT loops for each sample.
3. Produce per-sample `coverage.json` and `review.yaml` files.
4. Aggregate results into a final `result.yaml`.

## Project Layout

```text
.
├── bin/run-sample-fvt                # CLI entry point
├── Containerfile                     # Podman/Docker image build
├── package.json
├── .droids/                           # Droid / Ollama agent configuration
│   ├── ollama-droid.md
│   └── ollama.env.example
├── prompts/                           # Harness prompts
│   └── fvt-coverage.md
├── src/
│   ├── index.ts                    # Public API exports
│   └── sample-fvt/                 # Sample FVT implementation (copied from agentic-loop)
│       ├── coverage-calculator.ts
│       ├── coverage-reviewer.ts
│       ├── planner.ts
│       └── runner.ts
├── scripts/
│   ├── run-local-podman.sh          # Phase 1: local Podman run
│   ├── create-pr.sh                 # Phase 1: push FVT changes as a GitHub PR
│   ├── provision-code-engine.sh     # Phase 2: provision Code Engine resources
│   ├── run-code-engine-job.sh       # Phase 2: submit Code Engine job
│   └── teardown-code-engine.sh     # Phase 2: tear down Code Engine resources
└── tests/                           # Unit and integration tests
```

## Phase 1: Local Podman

### Prerequisites

- [Podman](https://podman.io/) 5.x
- A local clone of the Code Engine AI samples repo
- An Ollama server reachable from the container (for the `ollama-droid` runtime)
- The harness package published or linked locally (see [Development](#development))

### Required environment variables

The Podman run reads all credentials from environment variables. No credentials
are committed to the repository.

| Variable | Required | Description |
|----------|----------|-------------|
| `OLLAMA_HOST` | Yes | URL of the Ollama server, e.g. `http://host.containers.internal:11434` |
| `OLLAMA_MODELS` | Yes | Comma-separated list of Ollama model tags, e.g. `codellama:7b,llama3.1:8b` |
| `OLLAMA_API_KEY` | Yes | API key for the Ollama server, if authentication is required |
| `GITHUB_TOKEN` | No | GitHub token used by `scripts/create-pr.sh` to open a PR |
| `GITHUB_REPO` | No | Target repository in `owner/repo` form for the PR (optional; also read from plan metadata or git remote) |
| `GITHUB_BASE_BRANCH` | No | Base branch for the PR (default: `master`; also read from plan metadata) |

Copy `.droids/ollama.env.example` to `.droids/ollama.env`, fill in real values,
and source it before running the scripts. `.droids/ollama.env`, `*.key`, and
`*.token` are blocked by `.gitignore`.

### Quick start

```bash
# Link the local harness package until it is published on npm.
cd /path/to/AgenticLoop
npm link
cd /path/to/agentic-loop-codeengine-samples-example
npm link @agentic-loop/harness

# Mount a local clone of the Code Engine samples repo and run.
export OLLAMA_HOST="http://host.containers.internal:11434"
export OLLAMA_MODELS="codellama:7b,llama3.1:8b"
export OLLAMA_API_KEY="your-ollama-api-key"
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"      # optional, for PR creation
export GITHUB_REPO="owner/code-engine-samples" # optional; also read from plan or git remote

./scripts/run-local-podman.sh /path/to/code-engine-samples/samples/ai
```

The script builds the container with `AGENT_RUNTIME=ollama-droid`, mounts the
workspace, Droid config, and credential environment variables, runs the harness,
and then calls `scripts/create-pr.sh` when FVT changes exist.

For backwards compatibility, `OLLAMA_MODEL` is still accepted as a fallback if
`OLLAMA_MODELS` is not set, but `OLLAMA_MODELS` is the preferred variable.

### Watching live logs

The container is started with `--name agentic-loop-fvt`, so you can follow its
combined stdout/stderr in another terminal at any time:

```bash
podman logs -f agentic-loop-fvt
```

To tail the workspace harness log and the per-iteration agent logs inside the
running container, use the helper script:

```bash
./scripts/tail-logs.sh
```

To start a background log tail before the harness begins, set `FVT_TAIL_LOGS`:

```bash
FVT_TAIL_LOGS=true ./scripts/run-local-podman.sh /path/to/code-engine-samples/samples/ai
```

The run script prints the `podman logs -f agentic-loop-fvt` command at the start
and end of the run so it is easy to find.

### Manual build and run

```bash
podman build -f Containerfile --build-arg AGENT_RUNTIME=ollama-droid -t agentic-loop-codeengine-samples-example:latest .
mkdir -p ./workspace
podman run --rm \
  -v "$PWD/workspace:/workspace:Z" \
  -v "$PWD/.droids:/workspace/.droids:Z" \
  -v "/path/to/code-engine-samples:/workspace/inputs/code-engine-samples:Z" \
  -e HARNESS_AGENT_RUNTIME=ollama-droid \
  -e OLLAMA_HOST="$OLLAMA_HOST" \
  -e OLLAMA_MODELS="$OLLAMA_MODELS" \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md \
  -e FVT_MAX_ITERATIONS=5 \
  agentic-loop-codeengine-samples-example:latest \
  --samples-dir /workspace/inputs/code-engine-samples/samples/ai
```

### Expected outputs

After the run finishes, `./workspace/` contains:

- `inputs/code-engine-samples/` — mounted samples repository.
- `samples/{sample-name}/coverage.json` — per-sample coverage report.
- `samples/{sample-name}/review.yaml` — per-sample reviewer decision.
- `result.yaml` — aggregated status across all samples.
- `run.log` — harness execution log.

If `GITHUB_TOKEN` is set and the harness produced FVT changes,
`scripts/create-pr.sh` opens a pull request named `agentic-loop-fvt-{timestamp}`
with the FVT test updates. The target repository and base branch are read from
the plan metadata (or `github_repo` / `github_base_branch` inputs), from the
optional `GITHUB_REPO` / `GITHUB_BASE_BRANCH` environment variables, or derived
from the git origin remote of the mounted samples repo with base branch
`master`.

## Phase 2: IBM Cloud Code Engine

### Prerequisites

- [IBM Cloud CLI](https://cloud.ibm.com/docs/cli) with Code Engine plugin
- `IBMCLOUD_API_KEY` environment variable set
- Container image pushed to a registry reachable by Code Engine (e.g., IBM Cloud Container Registry)

### Provision resources

```bash
export IBMCLOUD_API_KEY="your-api-key"
export IBMCLOUD_REGION="us-south"
export CE_RESOURCE_GROUP="agenticloop"
export CE_IMAGE="icr.io/your-namespace/sample-fvt:latest"

./scripts/provision-code-engine.sh
```

### Submit the job

```bash
./scripts/run-code-engine-job.sh
```

### Teardown resources

```bash
./scripts/teardown-code-engine.sh
```

## Development

```bash
# Install dependencies
npm install

# Link the local harness until it is published on npm
# (run `npm link` first in the @agentic-loop/harness package directory)
npm link @agentic-loop/harness

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Format
npm run format
```

## Credentials

All credentials are provided at run time through environment variables only.
Never commit real credentials, tokens, or API keys to this repository.

| Variable | Source | Purpose |
|----------|--------|---------|
| `OLLAMA_HOST` | `.droids/ollama.env` or shell env | Ollama server URL |
| `OLLAMA_MODELS` | `.droids/ollama.env` or shell env | Comma-separated list of Ollama model tags |
| `OLLAMA_MODEL` | `.droids/ollama.env` or shell env | (deprecated) Single Ollama model tag; used as a fallback |
| `OLLAMA_API_KEY` | `.droids/ollama.env` or shell env | API key for the Ollama server, if authentication is required |
| `GITHUB_TOKEN` | GitHub personal access token | Push branch and open PR |
| `GITHUB_REPO` | Repository slug (`owner/repo`) | Target repository for the PR (optional; also read from plan or git remote) |
| `GITHUB_BASE_BRANCH` | Branch name | Base branch for the PR (default: `master`; also read from plan) |
| `IBMCLOUD_API_KEY` | IBM Cloud API key | Phase 2 Code Engine provisioning |

Provide these values by exporting them in your shell, sourcing `.droids/ollama.env`,
or passing them with `podman run -e`. The committed `.droids/ollama.env.example`
file contains placeholder values only.

## Configuration

The example is configured through environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FVT_MAX_ITERATIONS` | `5` | Maximum coverage loop iterations per sample |
| `FVT_TIME_LIMIT_MINUTES` | `120` | Overall time limit in minutes |
| `FVT_COVERAGE_THRESHOLD` | `100` | Coverage percent threshold for completion |
| `FVT_COVERAGE_STALL_DELTA` | `5` | Coverage improvement delta that signals a stall |

## License

Apache-2.0
