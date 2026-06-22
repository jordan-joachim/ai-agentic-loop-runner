# ai-agentic-loop-runner

Thin orchestration package that consumes
[`@ai-agentic-loop/harness`](https://github.com/jordan-joachim/ai-agentic-loop-harness)
and provides convenient scripts for running the AI agentic loop harness directly
with Node.js and inside a Podman container.

## Purpose

The runner is a lightweight consumer of the generic harness package. It does not
contain harness logic itself. Instead it provides:

- **Orchestration scripts** in `scripts/` that build the harness container image,
  run it against a workspace, and stream live logs.
- **Direct execution** support via the harness CLI, using the same workspace
  layout and plan format.
- **Podman execution** support that builds and runs the harness container with a
  bind-mounted workspace directory.

## Relationship to the Harness

The harness package (`@ai-agentic-loop/harness`) contains the core Plan-Do-Review
loop, agent runtime adapters (mock, droid, ollama-droid, kilo, codex), plan
parser/validator, workspace implementations, and the `bin/harness` CLI entry
point. See the
[harness documentation](https://github.com/jordan-joachim/ai-agentic-loop-harness)
for details on plan authoring, agent configuration, and runtime selection.

This runner package wraps the harness with scripts that handle:

- Resolving the harness repository path
- Building the container image with the selected agent runtime
- Validating environment variables and credentials
- Bind-mounting the workspace into the container
- Streaming live logs from the running container

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
