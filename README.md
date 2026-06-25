# ai-agentic-loop-runner

Thin orchestration package that consumes
[`@ai-agentic-loop/harness`](https://github.com/jordan-joachim/ai-agentic-loop-harness)
and provides convenient scripts for running the AI agentic loop harness with
Podman, IBM Cloud Code Engine jobs, or IBM Cloud Code Engine fleets.

## Purpose

The runner is a lightweight consumer of the generic harness package. It does not
contain harness logic itself. Instead it provides:

- **Prompt resolution** via `scripts/fetch-prompt.sh` — accepts a `PROMPT_SOURCE`
  (bare name, `dir:`, `file:`, or `github:` URL) and generates `plan.yaml` +
  `rules.yaml` into the workspace before the harness runs.
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

## Using a prompt from a repo

Set `PROMPT_SOURCE` before calling any `run-*.sh` script. The runner will
automatically resolve the prompt and generate `plan.yaml` + `rules.yaml` before
starting the harness.

### Bare name (sibling repo — local development)

Resolves to `../ai-agentic-loop-prompts/<name>/` relative to the runner root.
Requires `ai-agentic-loop-prompts` to be checked out as a sibling directory.

```bash
PROMPT_SOURCE=fvt-coverage \
HARNESS_AGENT_RUNTIME=kilo \
KILO_API_KEY=sk-... \
./scripts/run-podman.sh
```

### GitHub URL

Sparse-clones the specified subfolder from a GitHub repository.

```bash
PROMPT_SOURCE=github:jordan-joachim/ai-agentic-loop-prompts/fvt-coverage \
HARNESS_AGENT_RUNTIME=kilo \
KILO_API_KEY=sk-... \
./scripts/run-podman.sh
```

### Local directory

```bash
PROMPT_SOURCE=dir:/path/to/ai-agentic-loop-prompts/fvt-coverage \
HARNESS_AGENT_RUNTIME=kilo \
KILO_API_KEY=sk-... \
./scripts/run-podman.sh
```

### Single Markdown file

```bash
PROMPT_SOURCE=file:/path/to/my-plan.md \
HARNESS_AGENT_RUNTIME=kilo \
KILO_API_KEY=sk-... \
./scripts/run-podman.sh
```

### Without PROMPT_SOURCE (pre-populated workspace)

When `PROMPT_SOURCE` is not set the runner expects `plan.yaml` and `rules.yaml`
to already exist in the workspace — the original behaviour is preserved.

See [`plans/prompt-source-contract.md`](../ai-agentic-loop-mission-docs/plans/prompt-source-contract.md)
in the mission docs for the full resolution spec.

## Agent configuration

Copy a sample `agents.json` from the harness repo into your workspace as
`config/agents.json`, then fill in your credentials. The harness reads this
file at startup to select the runtime and model for each role (setup, doer,
reviewer, teardown).

Sample configs are in `../ai-agentic-loop-harness/agent-config-samples/`:

| File | Runtime | Default model |
|------|---------|--------------|
| `kilo.json` | `kilo` | `kilo-auto/free` |
| `droid.json` | `droid` | `openrouter/free` |
| `codex.json` | `codex` | `openrouter/free-router` |
| `ollama-droid.json` | `ollama-droid` | — (set `OLLAMA_MODELS`) |
| `bob-shell.json` | `bob-shell` | — (model managed by Bob service) |

```bash
mkdir -p workspace/config
cp ../ai-agentic-loop-harness/agent-config-samples/kilo.json workspace/config/agents.json
# Edit workspace/config/agents.json and fill in KILO_API_KEY value
```

Credentials can also be provided as environment variables; they take precedence
over values in `agents.json`. See the harness
[agent configuration docs](../ai-agentic-loop-harness/README.md#agent-configuration-workspaceconfigagentsjson)
for full details.

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

### Direct (local CLI)

| Script | Purpose |
|--------|---------|
| `scripts/setup-direct.sh` | Verify the harness repo exists and print direct-run instructions |
| `scripts/run-direct.sh` | Validate config, check the agent CLI, and run the harness CLI directly |
| `scripts/watch-direct.sh` | Tail `harness.log` and per-iteration agent logs in the workspace |

```bash
./scripts/setup-direct.sh
HARNESS_AGENT_RUNTIME=kilo KILO_API_KEY=... HARNESS_WORKSPACE=./workspace ./scripts/run-direct.sh
./scripts/watch-direct.sh
```

`run-direct.sh` loads `.env` from the runner root if present, requires
`HARNESS_WORKSPACE` and `HARNESS_AGENT_RUNTIME`, validates that the runtime is
one of `mock`, `droid`, `kilo`, `codex`, or `bob-shell`, and verifies the agent
CLI is installed on PATH for every non-mock runtime. If the CLI is missing, the
script exits with an install hint before invoking the harness.

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

Podman runs build the selected agent runtime CLI into the container image, so
`run-podman.sh` does not perform a host-side CLI presence check.

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
