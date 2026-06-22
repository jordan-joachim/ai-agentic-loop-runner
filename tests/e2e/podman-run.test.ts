import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE_TAG = `runner-e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

/** Absolute path to the runner repo root. */
const RUNNER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** Absolute path to the harness repo root. */
const HARNESS_ROOT = path.resolve(RUNNER_ROOT, '..', 'ai-agentic-loop-harness');

/**
 * Run a shell command synchronously and assert success (exit code 0).
 * Returns stdout trimmed.
 */
function runOrFail(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): string {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: opts?.cwd,
    env: opts?.env,
    timeout: 240_000, // 4-minute timeout per command
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status}): ${cmd} ${args.join(' ')}\n` +
        `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`,
    );
  }
  return (result.stdout ?? '').trim();
}

/**
 * Run a shell command synchronously, return the full result.
 */
function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: opts?.cwd,
    env: opts?.env,
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Create a minimal valid phased plan.yaml in the given directory.
 */
function createPlanFile(dir: string): void {
  const plan = {
    meta: { title: 'Runner E2E Test Plan', version: '2', author: 'e2e' },
    inputs: [
      {
        name: 'src',
        type: 'directory',
        path: './src',
        description: 'Source',
      },
    ],
    rules: [{ rule_id: 'RULE-001', applies: true }],
    phases: {
      setup: {
        description: 'Clone repos and install tools',
        outputs: [
          {
            name: 'summary',
            type: 'file',
            path: './setup/starting-summary.md',
            description: 'Starting summary',
          },
        ],
      },
      execute: {
        description: 'Implement the feature',
        goal: {
          description: 'Verify the harness runs end-to-end',
          measurable: 'result.yaml contains status: done',
        },
        completion_criteria: [
          {
            id: 'CC-001',
            description: 'Harness writes result',
            test: 'check result.yaml',
          },
        ],
        doer: 'Implement changes',
        reviewer: 'Review changes',
        outputs: [
          {
            name: 'out',
            type: 'file',
            path: './out',
            description: 'Output',
          },
        ],
      },
      teardown: {
        description: 'Push changes and write final summary',
        outputs: [
          {
            name: 'final',
            type: 'file',
            path: './teardown/final-summary.md',
            description: 'Final summary',
          },
        ],
      },
    },
  };
  fs.writeFileSync(
    path.join(dir, 'plan.yaml'),
    yaml.dump(plan, { lineWidth: -1, noRefs: true }),
    'utf-8',
  );
}

/**
 * Create a minimal valid rules.yaml in the given directory.
 */
function createRulesFile(dir: string): void {
  const rules = {
    rules: [
      {
        id: 'RULE-001',
        name: 'E2E Rule',
        description: 'A test rule',
        required: true,
        check: 'check',
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, 'rules.yaml'),
    yaml.dump(rules, { lineWidth: -1, noRefs: true }),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E — Runner Podman (VAL-RUNNER-005)', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-e2e-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
  }, 30_000);

  afterAll(() => {
    // Clean up images built during tests
    run('podman', ['rmi', '-f', IMAGE_TAG]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- Build the container image ----

  it('builds the harness container image with AGENT_RUNTIME=mock', () => {
    const stdout = runOrFail('podman', [
      'build',
      '--no-cache',
      '-t',
      IMAGE_TAG,
      '--build-arg',
      'AGENT_RUNTIME=mock',
      '-f',
      path.join(HARNESS_ROOT, 'Containerfile'),
      HARNESS_ROOT,
    ]);
    expect(stdout).toBeTruthy();

    // Verify the image exists
    const inspect = runOrFail('podman', [
      'image',
      'inspect',
      IMAGE_TAG,
    ]);
    expect(inspect).toBeTruthy();
  }, 120_000);

  // ---- VAL-RUNNER-005: Runner Podman end-to-end ----

  it('runs setup-podman.sh and run-podman.sh to produce result.yaml', () => {
    createPlanFile(workspaceDir);
    createRulesFile(workspaceDir);

    // Verify workspace contains plan.yaml and rules.yaml before run
    expect(fs.existsSync(path.join(workspaceDir, 'plan.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceDir, 'rules.yaml'))).toBe(true);

    // Run the container directly (equivalent to what run-podman.sh does)
    const result = run('podman', [
      'run',
      '--rm',
      '-v',
      `${workspaceDir}:/workspace:Z`,
      IMAGE_TAG,
    ]);

    // The harness exits with exit code 0 when status is "done"
    expect(result.status).toBe(0);

    // Verify result.yaml was written
    const resultPath = path.join(workspaceDir, 'result.yaml');
    expect(fs.existsSync(resultPath)).toBe(true);

    const resultYaml = yaml.load(
      fs.readFileSync(resultPath, 'utf-8'),
    ) as {
      status: string;
      iterations: number;
      finalReview?: { status: string };
    };
    expect(resultYaml.status).toBe('done');
    expect(resultYaml.iterations).toBeGreaterThanOrEqual(1);

    // Verify iteration directories exist
    expect(
      fs.existsSync(path.join(workspaceDir, 'iter-001')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(workspaceDir, 'iter-001', 'review.yaml')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(workspaceDir, 'iter-001', 'doer.log')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(workspaceDir, 'iter-001', 'reviewer.log')),
    ).toBe(true);
  }, 60_000);

  // ---- Verify result.yaml has a valid final status ----

  it('result.yaml has a valid final status', () => {
    const resultPath = path.join(workspaceDir, 'result.yaml');
    expect(fs.existsSync(resultPath)).toBe(true);

    const resultYaml = yaml.load(
      fs.readFileSync(resultPath, 'utf-8'),
    ) as {
      status: string;
      iterations: number;
      finalReview?: { status: string; gaps: string[] };
    };

    // Valid final statuses: done, incomplete, timeout, invalid-plan
    const validStatuses = ['done', 'incomplete', 'timeout', 'invalid-plan'];
    expect(validStatuses).toContain(resultYaml.status);
    expect(resultYaml.iterations).toBeGreaterThanOrEqual(0);

    if (resultYaml.finalReview) {
      expect(resultYaml.finalReview.status).toBeTruthy();
      expect(Array.isArray(resultYaml.finalReview.gaps)).toBe(true);
    }
  });

  // ---- Verify workspace contains plan.yaml and rules.yaml after run ----

  it('preserves plan.yaml in workspace after run', () => {
    expect(fs.existsSync(path.join(workspaceDir, 'plan.yaml'))).toBe(true);
    const planContent = yaml.load(
      fs.readFileSync(path.join(workspaceDir, 'plan.yaml'), 'utf-8'),
    ) as { meta: { title: string } };
    expect(planContent.meta.title).toBe('Runner E2E Test Plan');
  });

  it('preserves rules.yaml in workspace after run', () => {
    expect(fs.existsSync(path.join(workspaceDir, 'rules.yaml'))).toBe(true);
    const rulesContent = yaml.load(
      fs.readFileSync(path.join(workspaceDir, 'rules.yaml'), 'utf-8'),
    ) as { rules: Array<{ id: string }> };
    expect(rulesContent.rules).toBeDefined();
    expect(rulesContent.rules.length).toBeGreaterThan(0);
  });

  // ---- Verify setup-podman.sh script invocation ----

  it('setup-podman.sh script exists and is syntactically valid', () => {
    const setupScript = path.join(RUNNER_ROOT, 'scripts', 'setup-podman.sh');
    expect(fs.existsSync(setupScript)).toBe(true);

    // bash -n syntax check
    const result = run('bash', ['-n', setupScript]);
    expect(result.status).toBe(0);
  });

  it('run-podman.sh script exists and is syntactically valid', () => {
    const runScript = path.join(RUNNER_ROOT, 'scripts', 'run-podman.sh');
    expect(fs.existsSync(runScript)).toBe(true);

    // bash -n syntax check
    const result = run('bash', ['-n', runScript]);
    expect(result.status).toBe(0);
  });

  // ---- Verify setup-podman.sh builds the image ----

  it('setup-podman.sh builds the image when invoked with AGENT_RUNTIME=mock', () => {
    // Build a fresh image with a unique tag via setup-podman.sh
    const setupTag = `runner-setup-e2e-${Date.now()}`;
    const setupScript = path.join(RUNNER_ROOT, 'scripts', 'setup-podman.sh');

    try {
      const result = run('bash', [setupScript], {
        cwd: RUNNER_ROOT,
        env: {
          ...process.env,
          AGENT_RUNTIME: 'mock',
          HARNESS_IMAGE_TAG: setupTag,
          NO_CACHE: 'true',
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[setup-podman]');
      expect(result.stdout).toContain('Setup complete');

      // Verify the image exists
      const inspect = runOrFail('podman', ['image', 'inspect', setupTag]);
      expect(inspect).toBeTruthy();
    } finally {
      run('podman', ['rmi', '-f', setupTag]);
    }
  }, 120_000);

  // ---- Verify run-podman.sh runs the container ----

  it('run-podman.sh runs the container and produces result.yaml', () => {
    const runWorkspace = path.join(tmpDir, 'run-script-workspace');
    fs.mkdirSync(runWorkspace, { recursive: true });
    createPlanFile(runWorkspace);
    createRulesFile(runWorkspace);

    const runScript = path.join(RUNNER_ROOT, 'scripts', 'run-podman.sh');

    const result = run('bash', [runScript], {
      cwd: RUNNER_ROOT,
      env: {
        ...process.env,
        HARNESS_WORKSPACE: runWorkspace,
        HARNESS_AGENT_RUNTIME: 'mock',
        HARNESS_IMAGE_TAG: IMAGE_TAG,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[run-podman]');

    // Verify result.yaml was written
    const resultPath = path.join(runWorkspace, 'result.yaml');
    expect(fs.existsSync(resultPath)).toBe(true);

    const resultYaml = yaml.load(
      fs.readFileSync(resultPath, 'utf-8'),
    ) as { status: string };
    expect(resultYaml.status).toBe('done');
  }, 60_000);

  // ---- Verify phased plan produces setup and teardown artifacts ----

  it('produces setup/starting-summary.md and teardown/final-summary.md', () => {
    const phasedWorkspace = path.join(tmpDir, 'phased-workspace');
    fs.mkdirSync(phasedWorkspace, { recursive: true });
    createPlanFile(phasedWorkspace);
    createRulesFile(phasedWorkspace);

    const result = run('podman', [
      'run',
      '--rm',
      '-v',
      `${phasedWorkspace}:/workspace:Z`,
      IMAGE_TAG,
    ]);

    expect(result.status).toBe(0);

    // Verify setup/starting-summary.md exists
    const startingSummary = path.join(
      phasedWorkspace,
      'setup',
      'starting-summary.md',
    );
    expect(fs.existsSync(startingSummary)).toBe(true);

    // Verify teardown/final-summary.md exists
    const finalSummary = path.join(
      phasedWorkspace,
      'teardown',
      'final-summary.md',
    );
    expect(fs.existsSync(finalSummary)).toBe(true);

    // Verify result.yaml references the summaries
    const resultPath = path.join(phasedWorkspace, 'result.yaml');
    const resultYaml = yaml.load(
      fs.readFileSync(resultPath, 'utf-8'),
    ) as {
      status: string;
      startingSummary?: string;
      finalSummary?: string;
    };
    expect(resultYaml.status).toBe('done');
    expect(resultYaml.startingSummary).toBeTruthy();
    expect(resultYaml.finalSummary).toBeTruthy();
  }, 60_000);

  // ---- Verify structured review.yaml in workspace ----

  it('writes structured review.yaml in workspace', () => {
    const reviewPath = path.join(workspaceDir, 'iter-001', 'review.yaml');
    expect(fs.existsSync(reviewPath)).toBe(true);

    const review = yaml.load(
      fs.readFileSync(reviewPath, 'utf-8'),
    ) as {
      status: string;
      gaps: string[];
    };
    expect(review.status).toBe('done');
    expect(review.gaps).toBeDefined();
    expect(Array.isArray(review.gaps)).toBe(true);
  });
});
