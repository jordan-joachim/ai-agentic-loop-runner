/**
 * Integration tests for VAL-EXAMPLE-007:
 * The runner repo Containerfile uses the generic harness bin/harness
 * entrypoint (not a stale bin/run-sample-fvt), accepts an AGENT_RUNTIME
 * build argument that sets HARNESS_AGENT_RUNTIME, and does not hardcode
 * FVT-specific defaults. It also builds a self-contained image when a local
 * harness build context is provided and runs the harness CLI inside it.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTAINERFILE = path.join(REPO_ROOT, 'Containerfile');
const HARNESS_REPO_ROOT = process.env.AGENTIC_HARNESS_REPO_ROOT
  ? path.resolve(process.env.AGENTIC_HARNESS_REPO_ROOT)
  : path.resolve(REPO_ROOT, '..', 'ai-agentic-loop-harness');
const IMAGE_TAG = `runner-harness-cli-test-${Date.now()}`;

describe('VAL-EXAMPLE-007: runner repo Containerfile uses harness CLI', () => {
  it('Containerfile exists and is readable', () => {
    expect(fs.existsSync(CONTAINERFILE)).toBe(true);
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('ENTRYPOINT invokes node bin/harness with the workspace path', () => {
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content).toContain('ENTRYPOINT ["node", "bin/harness", "--workspace", "/workspace"]');
  });

  it('does not reference the stale bin/run-sample-fvt entrypoint', () => {
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content).not.toContain('bin/run-sample-fvt');
  });

  it('accepts AGENT_RUNTIME build arg and passes HARNESS_AGENT_RUNTIME', () => {
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content).toMatch(/ARG\s+AGENT_RUNTIME=/);
    expect(content).toContain('ENV HARNESS_AGENT_RUNTIME=${AGENT_RUNTIME}');
  });

  it('does not hardcode FVT-specific default environment variables', () => {
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content).not.toContain('FVT_MAX_ITERATIONS');
    expect(content).not.toContain('FVT_TIME_LIMIT_MINUTES');
    expect(content).not.toContain('FVT_COVERAGE_THRESHOLD');
    expect(content).not.toContain('FVT_COVERAGE_STALL_DELTA');
    expect(content).not.toContain('FVT_TAIL_LOGS');
  });

  it('copies and chmods the generic bin/harness entrypoint', () => {
    const content = fs.readFileSync(CONTAINERFILE, 'utf-8');
    expect(content).toContain('COPY bin/ ./bin/');
    expect(content).toContain('chmod +x bin/harness');
  });

  it('builds the image with a local harness build context and runs harness --help', () => {
    expect(fs.existsSync(HARNESS_REPO_ROOT)).toBe(true);
    expect(fs.existsSync(path.join(HARNESS_REPO_ROOT, 'bin', 'harness'))).toBe(true);

    const buildArgs = [
      'build',
      '-f',
      CONTAINERFILE,
      '--build-context',
      `harness=${HARNESS_REPO_ROOT}`,
      '--build-arg',
      'AGENT_RUNTIME=mock',
      '-t',
      IMAGE_TAG,
      REPO_ROOT,
    ];

    const buildOutput = execFileSync('podman', buildArgs, {
      encoding: 'utf-8',
      timeout: 300_000,
    });
    expect(buildOutput).toContain('Installing local harness package from build context');
    expect(buildOutput).toContain('Successfully tagged');

    const runOutput = execFileSync('podman', ['run', '--rm', IMAGE_TAG, '--help'], {
      encoding: 'utf-8',
      timeout: 30_000,
    });
    expect(runOutput).toContain('Usage: bin/harness --workspace <path>');
    expect(runOutput).toContain('--help');
    expect(runOutput).toContain('--version');

    // Clean up the test image.
    try {
      execFileSync('podman', ['rmi', '-f', IMAGE_TAG], { encoding: 'utf-8' });
    } catch {
      // ignore cleanup errors
    }
  }, 360_000);

  it('sets HARNESS_AGENT_RUNTIME from the AGENT_RUNTIME build arg', () => {
    expect(fs.existsSync(HARNESS_REPO_ROOT)).toBe(true);

    const tag = `${IMAGE_TAG}-droid`;
    const buildArgs = [
      'build',
      '-f',
      CONTAINERFILE,
      '--build-context',
      `harness=${HARNESS_REPO_ROOT}`,
      '--build-arg',
      'AGENT_RUNTIME=droid',
      '-t',
      tag,
      REPO_ROOT,
    ];

    execFileSync('podman', buildArgs, {
      encoding: 'utf-8',
      timeout: 300_000,
    });

    const envOutput = execFileSync(
      'podman',
      ['run', '--rm', '--entrypoint', 'sh', tag, '-c', 'echo $HARNESS_AGENT_RUNTIME'],
      {
        encoding: 'utf-8',
        timeout: 30_000,
      },
    );
    expect(envOutput.trim()).toBe('droid');

    try {
      execFileSync('podman', ['rmi', '-f', tag], { encoding: 'utf-8' });
    } catch {
      // ignore cleanup errors
    }
  }, 360_000);
});
