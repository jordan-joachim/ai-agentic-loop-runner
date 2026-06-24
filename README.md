# ai-agentic-loop-runner

Thin orchestration package that consumes
[`@ai-agentic-loop/harness`](https://github.com/jordan-joachim/ai-agentic-loop-harness)
and provides convenient scripts for running the AI agentic loop harness with
Podman, IBM Cloud Code Engine jobs, or IBM Cloud Code Engine fleets.

## Purpose

The runner is a lightweight consumer of the generic harness package. It does not
contain harness logic itself. Instead it provides:

- **Orchestration scripts** in `scripts/` that build the harness container image,
  run it against a workspace, and stream live logs.
- **Direct execution** support via the harness CLI, using the same workspace
  layout and plan format.
- **Podman execution** support that builds and runs the harness container with a
  bind-mounted workspace directory.
- **Code Engine job** support that runs the harness as a Code Engine batch job
  backed by IBM Cloud Object Storage (COS SDK download/upload cycle).
- **Code Engine fleet** support that runs the harness as a Code Engine fleet
  task with the COS workspace bucket mounted directly at `/workspace` via a
  persistent data store (no SDK round-trip; files written during the run
  appear in COS immediately).

## Relationship to the Harness

The harness package (`@ai-agentic-loop/harness`) contains the core Plan-Do-Review
loop, agent runtime adapters (mock, droid, ollama-droid, kilo, codex, bob-shell),
plan parser/validator, workspace implementations, and the `bin/harness` CLI entry
point. See the
[harness documentation](https://github.com/jordan-joachim/ai-agentic-loop-harness)
for details on plan authoring, agent configuration, and runtime selection.

This runner package wraps the harness with scripts that handle:

- Resolving the harness repository path
- Building the container image with the selected agent runtime
- Validating environment variables and credentials
- Bind-mounting or provisioning the workspace
- Streaming live logs from the running container or CE fleet

## Scripts

All scripts load a `.env` file from the runner root if one is present, then
set `AGENTIC_NO_DOTENV=true` before delegating to the harness scripts to
prevent double-loading.

### Podman (local container)

| Script | Purpose |
|--------|---------|
| `scripts/setup-podman.sh` | Build harness container image with selected `AGENT_RUNTIME` |
| `scripts/run-podman.sh` | Run harness in a Podman container with bind-mounted workspace |
| `scripts/watch-podman.sh` | Tail live logs from the running container |

```bash
AGENT_RUNTIME=kilo ./scripts/setup-podman.sh
HARNESS_AGENT_RUNTIME=kilo KILO_API_KEY=... ./scripts/run-podman.sh
./scripts/watch-podman.sh
```

### Code Engine — Job mode

Runs the harness as a CE batch job. The workspace is downloaded from COS at
startup and uploaded back when complete (`COSWorkspace` mode).

CE project: `agentic-loop-job` · Resource group: `agentic-loop`

| Script | Purpose |
|--------|---------|
| `scripts/setup-code-engine-job.sh` | One-time provision of CE project, COS bucket, IAM service ID, CE job definition |
| `scripts/run-code-engine-job.sh` | Upload plan inputs to COS and submit a job run |
| `scripts/watch-code-engine-job.sh [job-run-name]` | Follow job logs and print result download instructions |

```bash
export IBMCLOUD_API_KEY="..."
export CE_IMAGE="us.icr.io/my-namespace/harness:latest"
./scripts/setup-code-engine-job.sh

export COS_BUCKET="agentic-loop-job-<timestamp>"   # printed by setup
./scripts/run-code-engine-job.sh
./scripts/watch-code-engine-job.sh
```

### Code Engine — Fleet mode

Runs the harness as a CE fleet with a single task. The COS workspace bucket is
mounted directly at `/workspace` via a persistent data store (`LocalWorkspace`
mode — no COS SDK download/upload needed). Requires a VPC subnet pool for
network placement.

CE project: `agentic-loop-fleet` · Resource group: `agentic-loop`

| Script | Purpose |
|--------|---------|
| `scripts/setup-code-engine-fleet.sh` | One-time provision of CE project, COS bucket, HMAC secret, subnet pool, workspace PDS, task-state PDS |
| `scripts/run-code-engine-fleet.sh` | Upload plan inputs to COS and create a fleet (starts immediately) |
| `scripts/watch-code-engine-fleet.sh [fleet-name]` | Follow fleet task logs and print result download instructions |

```bash
export IBMCLOUD_API_KEY="..."
export CE_FLEET_SUBNET_CRNS="crn:v1:bluemix:public:is:us-south-1:..."
./scripts/setup-code-engine-fleet.sh

export COS_BUCKET="agentic-loop-fleet-<timestamp>"  # printed by setup
export CE_IMAGE="us.icr.io/my-namespace/harness:latest"
./scripts/run-code-engine-fleet.sh
./scripts/watch-code-engine-fleet.sh
```

See [`docs/code-engine-fleet-guide.md`](../ai-agentic-loop-harness/docs/code-engine-fleet-guide.md)
in the harness repo for a full walkthrough.

## Quick Start

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test
```

## License

Apache-2.0
