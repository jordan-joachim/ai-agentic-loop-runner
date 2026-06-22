/**
 * ai-agentic-loop-runner
 *
 * Thin orchestration package that consumes @ai-agentic-loop/harness and provides
 * scripts for running the harness directly and in Podman.
 *
 * The harness package is consumed via its CLI (bin/harness) and orchestration
 * scripts in scripts/. This module serves as the package entry point for
 * programmatic consumers that want to import types or utilities from the runner.
 */

export { parseArgs, loadConfig, run } from '@ai-agentic-loop/harness';
export type * from '@ai-agentic-loop/harness/types';
