# Quickstart

Get the Agentic Harness runner package running against IBM Code Engine AI samples in three execution modes: local direct execution, local Podman, and IBM Cloud Code Engine.

---

## 1. Prerequisites

| Execution mode | Tools | Notes |
|---|---|---|
| All | [Node.js](https://nodejs.org/) 22 LTS | Required by the harness and runner package |
| Local Podman execution | [Podman](https://podman.io/) 5.x | For local container execution |
| IBM Cloud Code Engine execution | [IBM Cloud CLI](https://cloud.ibm.com/docs/cli) | With `code-engine`, `cloud-object-storage`, and `iam` plugins |
| IBM Cloud Code Engine execution | IBM Cloud account | API key with permission to create Code Engine and COS resources |

Install the runner package dependencies once:

```bash
cd /path/to/ai-agentic-loop-runner
npm install
```

If the `@agentic-loop/harness` package is not yet published on npm, link it locally:

```bash
cd /path/to/AgenticLoop
npm link

cd /path/to/ai-agentic-loop-runner
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
| `IBMCLOUD_API_KEY` | IBM Cloud Code Engine execution | IBM Cloud API key with permissions for Code Engine and COS |
| `IBMCLOUD_REGION` | IBM Cloud Code Engine execution | Target IBM Cloud region (default: `us-south`) |

For local convenience, copy `.droids/ollama.env.example` to `.droids/ollama.env`, fill in real values, and source it before running scripts:

```bash
cp .droids/ollama.env.example .droids/ollama.env
# edit .droids/ollama.env with your values
source .droids/ollama.env
```

The real `.droids/ollama.env` file is ignored by `.gitignore` and must never be committed.

---

## 3. Quickstart — direct harness execution

Run the harness directly with Node.js. The default runtime is `mock`, which is useful for testing the harness without an Ollama server. Set `HARNESS_AGENT_RUNTIME=ollama-droid` to use a real Ollama backend.

```bash
# With the default mock runtime
./scripts/setup-direct.sh
./scripts/run-direct.sh

# With the Ollama runtime
export HARNESS_AGENT_RUNTIME=ollama-droid
export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODELS="codellama:7b,llama3.1:8b"
export OLLAMA_API_KEY="your-ollama-api-key"

./scripts/setup-direct.sh
./scripts/run-direct.sh
```

Pass a prompt file as the first argument (the default prompt is no longer bundled in this repo; obtain it from `ai-agentic-loop-prompts`):

```bash
./scripts/run-direct.sh /path/to/ai-agentic-loop-prompts/fvt-coverage.md
```

Local direct execution writes the prompt to `workspace/plan.yaml` and runs `node node_modules/.bin/harness --workspace workspace`.

---

## 4. Quickstart — local Podman

Build and run the runner container locally. This phase always uses the `ollama-droid` runtime.

```bash
export OLLAMA_HOST="http://host.containers.internal:11434"
export OLLAMA_MODELS="codellama:7b,llama3.1:8b"
export OLLAMA_API_KEY="your-ollama-api-key"

./scripts/setup-podman.sh
./scripts/run-podman.sh
```

`setup-podman.sh` checks for Podman 5.x and builds the image `ai-agentic-loop-runner:latest` only when the source files or `Containerfile` have changed. To force a rebuild, run `NO_CACHE=true ./scripts/setup-podman.sh`.

`run-podman.sh` names the container `agentic-loop-fvt`, mounts `workspace/` as `/workspace`, and passes all required environment variables to the container.

---

## 5. Quickstart — IBM Cloud Code Engine

Provision Code Engine resources once, then submit job runs as needed.

```bash
export IBMCLOUD_API_KEY="your-ibm-cloud-api-key"
export IBMCLOUD_REGION="us-south"

./scripts/setup-codeengine.sh
export COS_BUCKET="agentic-loop-harness-..."   # value printed by setup-codeengine.sh
./scripts/run-codeengine.sh /path/to/ai-agentic-loop-prompts/fvt-coverage.md
```

`setup-codeengine.sh` creates or reuses:

- Resource group `agenticloop`
- Code Engine project `agentic-loop-ce-project`
- COS service instance `agenticloop-cos` and bucket `agentic-loop-harness-<unique>`
- Service ID `agentic-loop-harness-sa` with COS Writer/Reader IAM policy
- Code Engine secret `agentic-loop-harness-cos-secret` with HMAC credentials
- Code Engine job `agentic-loop-harness-job`

Override resource names with environment variables such as `CE_PROJECT_NAME`, `CE_JOB_NAME`, and `COS_BUCKET`.

`run-codeengine.sh` uploads `workspace/plan.yaml` (or the prompt file you provide) and any files under `workspace/inputs/` to COS, then submits a job run named `agentic-loop-run-<timestamp>`.

---

## 6. Watching logs

Each phase has a dedicated watch script.

### Local direct execution

```bash
./scripts/watch-direct.sh
```

Tails `workspace/harness.log` and `workspace/iter-*/doer-*.log` and `workspace/iter-*/reviewer-*.log`.

### Local Podman execution

```bash
./scripts/watch-podman.sh
```

Follows both `podman logs -f agentic-loop-fvt` and the workspace agent logs from inside the container.

You can also follow the container logs directly at any time:

```bash
podman logs -f agentic-loop-fvt
```

### IBM Cloud Code Engine execution

```bash
./scripts/watch-codeengine.sh agentic-loop-run-1234567890
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

If `setup-podman.sh` reports that Podman is not installed or the version is below 5.x:

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
- The Code Engine project and job were provisioned successfully by `setup-codeengine.sh`.

### `ollama-droid` runtime cannot reach Ollama

For local Podman, use `host.containers.internal` or the host IP instead of `localhost` so the container can reach the host Ollama server:

```bash
export OLLAMA_HOST="http://host.containers.internal:11434"
```

Make sure Ollama is listening on all interfaces (`0.0.0.0`) or on the bridge IP used by the container.

### COS upload or download fails

- Confirm `IBMCLOUD_API_KEY` has permissions for Cloud Object Storage.
- Verify the bucket exists and the service ID policy was created by `setup-codeengine.sh`.
- Check that the Code Engine secret contains valid `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` values.
