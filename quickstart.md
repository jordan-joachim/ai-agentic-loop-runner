# Quickstart

Get the Agentic Harness running against IBM Code Engine AI samples in three phases:
local direct execution, local Podman, and IBM Cloud Code Engine.

---

## 1. Prerequisites

| Phase | Tools | Notes |
|---|---|---|
| All | [Node.js](https://nodejs.org/) 22 LTS | Required by the harness and example repo |
| Phase 2 | [Podman](https://podman.io/) 5.x | For local container execution |
| Phase 3 | [IBM Cloud CLI](https://cloud.ibm.com/docs/cli) | With `code-engine`, `cloud-object-storage`, and `iam` plugins |
| Phase 3 | IBM Cloud account | API key with permission to create Code Engine and COS resources |

Install the example repository dependencies once:

```bash
cd /path/to/agentic-loop-codeengine-samples-example
npm install
```

If the `@agentic-loop/harness` package is not yet published on npm, link it locally:

```bash
cd /path/to/AgenticLoop
npm link

cd /path/to/agentic-loop-codeengine-samples-example
npm link @agentic-loop/harness
```

---

## 2. Credentials summary

All credentials are provided at run time through environment variables. Do not commit secrets, tokens, or API keys to this repository.

| Variable | Required for | Description |
|---|---|---|
| `OLLAMA_HOST` | `ollama-droid` runtime | URL of the Ollama server, e.g. `http://localhost:11434` |
| `OLLAMA_MODELS` | `ollama-droid` runtime | Comma-separated list of model tags, e.g. `codellama:7b,llama3.1:8b` |
| `OLLAMA_API_KEY` | `ollama-droid` runtime | API key for the Ollama server, if authentication is required |
| `GITHUB_TOKEN` | PR creation | GitHub personal access token (optional) |
| `IBMCLOUD_API_KEY` | Phase 3 | IBM Cloud API key with permissions for Code Engine and COS |
| `IBMCLOUD_REGION` | Phase 3 | Target IBM Cloud region (default: `us-south`) |

For local convenience, copy `.droids/ollama.env.example` to `.droids/ollama.env`, fill in real values, and source it before running scripts:

```bash
cp .droids/ollama.env.example .droids/ollama.env
# edit .droids/ollama.env with your values
source .droids/ollama.env
```

The real `.droids/ollama.env` file is ignored by `.gitignore` and must never be committed.

---

## 3. Phase 1 quickstart — direct harness execution

Run the harness directly with Node.js. The default runtime is `mock`, which is useful for testing the harness without an Ollama server. Set `HARNESS_AGENT_RUNTIME=ollama-droid` to use a real Ollama backend.

```bash
# With the default mock runtime
./scripts/setup-phase1.sh
./scripts/run-phase1.sh

# With the Ollama runtime
export HARNESS_AGENT_RUNTIME=ollama-droid
export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODELS="codellama:7b,llama3.1:8b"
export OLLAMA_API_KEY="your-ollama-api-key"

./scripts/setup-phase1.sh
./scripts/run-phase1.sh
```

The default prompt is `prompts/fvt-coverage.md`. Pass a different prompt file as the first argument:

```bash
./scripts/run-phase1.sh /path/to/your/plan.md
```

Phase 1 writes the prompt to `workspace/plan.yaml` and runs `node node_modules/.bin/harness --workspace workspace`.

---

## 4. Phase 2 quickstart — local Podman

Build and run the example container locally. This phase always uses the `ollama-droid` runtime.

```bash
export OLLAMA_HOST="http://host.containers.internal:11434"
export OLLAMA_MODELS="codellama:7b,llama3.1:8b"
export OLLAMA_API_KEY="your-ollama-api-key"

./scripts/setup-phase2.sh
./scripts/run-phase2.sh
```

`setup-phase2.sh` checks for Podman 5.x and builds the image `agentic-loop-codeengine-samples-example:latest` only when the source files or `Containerfile` have changed. To force a rebuild, run `NO_CACHE=true ./scripts/setup-phase2.sh`.

`run-phase2.sh` names the container `agentic-loop-fvt`, mounts `workspace/` as `/workspace`, and passes all required environment variables to the container.

---

## 5. Phase 3 quickstart — IBM Cloud Code Engine

Provision Code Engine resources once, then submit job runs as needed.

```bash
export IBMCLOUD_API_KEY="your-ibm-cloud-api-key"
export IBMCLOUD_REGION="us-south"

./scripts/setup-phase3.sh
export COS_BUCKET="agentic-loop-harness-..."   # value printed by setup-phase3.sh
./scripts/run-phase3.sh
```

`setup-phase3.sh` creates or reuses:

- Resource group `agenticloop`
- Code Engine project `agentic-loop-ce-project`
- COS service instance `agenticloop-cos` and bucket `agentic-loop-harness-<unique>`
- Service ID `agentic-loop-harness-sa` with COS Writer/Reader IAM policy
- Code Engine secret `agentic-loop-harness-cos-secret` with HMAC credentials
- Code Engine job `agentic-loop-harness-job`

Override resource names with environment variables such as `CE_PROJECT_NAME`, `CE_JOB_NAME`, and `COS_BUCKET`.

`run-phase3.sh` uploads `workspace/plan.yaml` (or the prompt file you provide) and any files under `workspace/inputs/` to COS, then submits a job run named `agentic-loop-run-<timestamp>`.

---

## 6. Watching logs

Each phase has a dedicated watch script.

### Phase 1

```bash
./scripts/watch-phase1.sh
```

Tails `workspace/harness.log` and `workspace/iter-*/doer-*.log` and `workspace/iter-*/reviewer-*.log`.

### Phase 2

```bash
./scripts/watch-phase2.sh
```

Follows both `podman logs -f agentic-loop-fvt` and the workspace agent logs from inside the container.

You can also follow the container logs directly at any time:

```bash
podman logs -f agentic-loop-fvt
```

### Phase 3

```bash
./scripts/watch-phase3.sh agentic-loop-run-1234567890
```

Follows the Code Engine job run logs. If you omit the job-run name, the script uses the most recent run for the configured job.

After the run, download result artifacts from COS:

```bash
ibmcloud cos objects --bucket ${COS_BUCKET}
ibmcloud cos object-get --bucket ${COS_BUCKET} --key result.yaml --output result.yaml
```

---

## 7. Troubleshooting

### Missing environment variable

The phase scripts validate required environment variables before starting. If you see an error like `OLLAMA_HOST is required`, export the variable and retry.

### Podman not running

If `setup-phase2.sh` reports that Podman is not installed or the version is below 5.x:

1. Install Podman 5.x from https://podman.io/.
2. Start the Podman machine if required by your platform:

   ```bash
   podman machine init
   podman machine start
   ```

### Code Engine job pending

Code Engine jobs may stay in a pending state while the cluster scales. Check status with:

```bash
ibmcloud ce jobrun list --job agentic-loop-harness-job
ibmcloud ce jobrun get --name agentic-loop-run-<timestamp>
```

If the job is pending for more than a few minutes, verify that:

- Your IBM Cloud account has enough quota for Code Engine jobs.
- The container image reference (`CE_IMAGE`) is reachable from Code Engine. Public images or images in IBM Cloud Container Registry with the correct registry secret work best.
- The Code Engine project and job were provisioned successfully by `setup-phase3.sh`.

### `ollama-droid` runtime cannot reach Ollama

For Phase 2, use `host.containers.internal` or the host IP instead of `localhost` so the container can reach the host Ollama server:

```bash
export OLLAMA_HOST="http://host.containers.internal:11434"
```

Make sure Ollama is listening on all interfaces (`0.0.0.0`) or on the bridge IP used by the container.

### COS upload or download fails

- Confirm `IBMCLOUD_API_KEY` has permissions for Cloud Object Storage.
- Verify the bucket exists and the service ID policy was created by `setup-phase3.sh`.
- Check that the Code Engine secret contains valid `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` values.
