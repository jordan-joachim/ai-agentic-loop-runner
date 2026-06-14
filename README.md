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
├── src/
│   ├── index.ts                    # Public API exports
│   └── sample-fvt/                 # Sample FVT implementation (copied from agentic-loop)
│       ├── coverage-calculator.ts
│       ├── coverage-reviewer.ts
│       ├── planner.ts
│       └── runner.ts
├── scripts/
│   ├── run-local-podman.sh          # Phase 1: local Podman run
│   ├── provision-code-engine.sh     # Phase 2: provision Code Engine resources
│   ├── run-code-engine-job.sh       # Phase 2: submit Code Engine job
│   └── teardown-code-engine.sh     # Phase 2: tear down Code Engine resources
└── tests/                           # Unit tests (when present)
```

## Phase 1: Local Podman

### Prerequisites

- [Podman](https://podman.io/) 5.x
- A local clone of the Code Engine AI samples repo

### Build and run

```bash
# Using the provided script
./scripts/run-local-podman.sh /path/to/code-engine-samples/samples/ai

# Or manually build and run
podman build -f Containerfile -t agentic-loop-codeengine-samples-example:latest .
mkdir -p ./workspace
podman run --rm \
  -v "$PWD/workspace:/workspace:Z" \
  -v "/path/to/code-engine-samples/samples/ai:/workspace/samples:Z" \
  -e FVT_MAX_ITERATIONS=5 \
  agentic-loop-codeengine-samples-example:latest \
  --samples-dir /workspace/samples
```

Output files are written to `./workspace/`.

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

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Format
npm run format
```

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
