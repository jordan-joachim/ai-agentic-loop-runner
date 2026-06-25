import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
  existsSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests for scripts/run-podman.sh
 *
 * These tests verify the script structure, env var validation, runtime-specific
 * credential checks, and direct podman run command emission without requiring
 * a real container. Podman is mocked via a fake podman script placed on PATH.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'run-podman.sh');
const DIST_PATH = resolve(__dirname, '..', 'dist');

// Track temp dirs for cleanup
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'runner-run-podman-test-'));
  tempDirs.push(dir);
  return dir;
}

function cleanup() {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Copy the runner script into a temporary runner layout and symlink dist/.
 */
function copyRunnerLayout(baseDir: string): { runnerDir: string } {
  const runnerDir = join(baseDir, 'ai-agentic-loop-runner');
  const scriptsDir = join(runnerDir, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });

  writeFileSync(
    join(scriptsDir, 'run-podman.sh'),
    readFileSync(SCRIPT_PATH, 'utf-8'),
  );
  chmodSync(join(scriptsDir, 'run-podman.sh'), 0o755);

  const distLink = join(runnerDir, 'dist');
  symlinkSync(DIST_PATH, distLink);

  return { runnerDir };
}

/**
 * Creates a mock podman script that records invocations.
 */
function createMockPodman(binDir: string): string {
  const mockBinDir = join(binDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });

  const logFile = join(binDir, 'podman-invocations.log');

  const mockScript = `#!/usr/bin/env bash
printf '%s\n' "$*" >> "${logFile}"

exit 0
`;

  const mockPath = join(mockBinDir, 'podman');
  writeFileSync(mockPath, mockScript);
  chmodSync(mockPath, 0o755);
  return mockBinDir;
}

/**
 * Creates a workspace directory with a minimal plan.yaml for validation.
 */
function createWorkspace(baseDir: string): string {
  const workspaceDir = join(baseDir, 'workspace');
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(
    join(workspaceDir, 'plan.yaml'),
    'meta:\n  title: Test Plan\n  version: "2"\n',
  );
  return workspaceDir;
}

describe('scripts/run-podman.sh', () => {
  afterAll(() => {
    cleanup();
  });

  describe('script structure', () => {
    it('exists and is executable', () => {
      expect(existsSync(SCRIPT_PATH)).toBe(true);
      // bash -n (syntax check) produces no output on success
      const result = execFileSync('bash', ['-n', SCRIPT_PATH], {
        encoding: 'utf-8',
      });
      expect(result).toBe('');
    });

    it('has a shebang line', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
    });

    it('uses set -euo pipefail', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('set -euo pipefail');
    });
  });

  describe('HARNESS_WORKSPACE validation', () => {
    it('fails fast when HARNESS_WORKSPACE is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_AGENT_RUNTIME: 'mock',
            // HARNESS_WORKSPACE intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without HARNESS_WORKSPACE');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('HARNESS_WORKSPACE is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails fast when HARNESS_WORKSPACE is empty string', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: '',
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed with empty HARNESS_WORKSPACE');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('HARNESS_WORKSPACE is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails when workspace directory does not exist', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: '/nonexistent/path',
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed with nonexistent workspace');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('does not exist');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('HARNESS_AGENT_RUNTIME validation', () => {
    it('fails fast when HARNESS_AGENT_RUNTIME is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            // HARNESS_AGENT_RUNTIME intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without HARNESS_AGENT_RUNTIME');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('HARNESS_AGENT_RUNTIME is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails fast when HARNESS_AGENT_RUNTIME is unsupported', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'unsupported-runtime',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed with unsupported runtime');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('Unsupported runtime');
        expect(output).toContain('unsupported-runtime');
        expect(error.status).not.toBe(0);
      }
    });

    it('accepts all supported runtime values', () => {
      const supportedRuntimes = ['mock', 'droid', 'kilo', 'codex'];

      for (const runtime of supportedRuntimes) {
        const testDir = createTempDir();
        const mockBinDir = createMockPodman(testDir);
        const workspaceDir = createWorkspace(testDir);
        const logFile = join(testDir, 'podman-invocations.log');

        const { runnerDir } = copyRunnerLayout(testDir);

        const env: Record<string, string> = {
          ...process.env,
          PATH: `${mockBinDir}:${process.env.PATH}`,
          HARNESS_WORKSPACE: workspaceDir,
          HARNESS_AGENT_RUNTIME: runtime,
        };

        if (runtime === 'kilo') {
          env.KILO_API_KEY = 'test-kilo-key';
        }
        if (runtime === 'codex') {
          env.CODEX_API_KEY = 'test-codex-key';
          env.OPENROUTER_API_KEY = 'test-openrouter-key';
        }

        execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'run-podman.sh')],
          {
            encoding: 'utf-8',
            env,
            cwd: runnerDir,
          },
        );

        const invocations = readFileSync(logFile, 'utf-8');
        expect(invocations).toContain(`-e HARNESS_AGENT_RUNTIME=${runtime}`);
      }
    });
  });

  describe('runtime-specific credential validation', () => {
    it('fails for droid with ollama backend when OLLAMA_HOST is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'droid',
            HARNESS_AGENT_BACKEND: 'ollama',
            OLLAMA_MODELS: 'llama3',
            // OLLAMA_HOST intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without OLLAMA_HOST');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('OLLAMA_HOST');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for droid with ollama backend when OLLAMA_MODELS is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'droid',
            HARNESS_AGENT_BACKEND: 'ollama',
            OLLAMA_HOST: 'http://localhost:11434',
            // OLLAMA_MODELS and OLLAMA_MODEL intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without OLLAMA_MODELS');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('OLLAMA_MODELS');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for kilo when KILO_API_KEY is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'kilo',
            // Explicitly unset KILO_API_KEY (may be set in parent env)
            KILO_API_KEY: '',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without KILO_API_KEY');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('KILO_API_KEY');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for codex when CODEX_API_KEY is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'codex',
            OPENROUTER_API_KEY: 'test-openrouter-key',
            // CODEX_API_KEY intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without CODEX_API_KEY');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('CODEX_API_KEY');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for codex when OPENROUTER_API_KEY is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'codex',
            CODEX_API_KEY: 'test-codex-key',
            // Explicitly unset OPENROUTER_API_KEY (may be set in parent env)
            OPENROUTER_API_KEY: '',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without OPENROUTER_API_KEY');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('OPENROUTER_API_KEY');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('mock runtime support', () => {
    it('runs successfully with mock runtime and no extra credentials', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
            // No extra credentials needed for mock
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Runtime: mock');
      expect(result).toContain('Running harness:latest');
    });
  });

  describe('direct podman run command', () => {
    it('does not delegate to harness dev/run-container.sh', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);
      const logFile = join(testDir, 'podman-invocations.log');

      const { runnerDir } = copyRunnerLayout(testDir);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        },
      );

      expect(result).not.toContain('[run-container]');
      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('run');
      expect(invocations).toContain('--rm');
    });

    it('bind-mounts the workspace as /workspace:Z', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);
      const logFile = join(testDir, 'podman-invocations.log');

      const { runnerDir } = copyRunnerLayout(testDir);

      execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        },
      );

      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain(`${workspaceDir}:/workspace:Z`);
    });

    it('uses a deterministic container name harness-$(date +%s)-$$', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toMatch(/Container name: harness-\d+-\d+/);
    });

    it('passes optional env vars as -e flags to podman run', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);
      const logFile = join(testDir, 'podman-invocations.log');

      const { runnerDir } = copyRunnerLayout(testDir);

      execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'codex',
            HARNESS_IMAGE_TAG: 'harness:custom',
            HARNESS_MAX_ITERATIONS: '5',
            HARNESS_TIME_LIMIT_MINUTES: '30',
            CODEX_API_KEY: 'test-codex-key',
            OPENROUTER_API_KEY: 'test-openrouter-key',
          },
          cwd: runnerDir,
        },
      );

      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('harness:custom');
      expect(invocations).toContain('-e HARNESS_MAX_ITERATIONS=5');
      expect(invocations).toContain('-e HARNESS_TIME_LIMIT_MINUTES=30');
      expect(invocations).toContain('-e CODEX_API_KEY=test-codex-key');
      expect(invocations).toContain('-e OPENROUTER_API_KEY=test-openrouter-key');
    });

    it('passes all runtime credentials through for droid with ollama backend', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);
      const logFile = join(testDir, 'podman-invocations.log');

      const { runnerDir } = copyRunnerLayout(testDir);

      execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'droid',
            HARNESS_AGENT_BACKEND: 'ollama',
            OLLAMA_HOST: 'http://localhost:11434',
            OLLAMA_MODELS: 'llama3,mistral',
            OLLAMA_API_KEY: 'test-ollama-key',
          },
          cwd: runnerDir,
        },
      );

      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('-e OLLAMA_HOST=http://localhost:11434');
      expect(invocations).toContain('-e OLLAMA_MODELS=llama3,mistral');
      expect(invocations).toContain('-e OLLAMA_API_KEY=test-ollama-key');
    });
  });

  describe('HARNESS_TAIL_LOGS support', () => {
    it('starts podman logs -f in the background when HARNESS_TAIL_LOGS=true', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      const { runnerDir } = copyRunnerLayout(testDir);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
            HARNESS_TAIL_LOGS: 'true',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Launching local log tail');
      expect(result).toContain('podman logs -f');
    });
  });

  describe('podman validation', () => {
    it('fails with clear error when podman is not on PATH', () => {
      const testDir = createTempDir();
      const workspaceDir = createWorkspace(testDir);

      const minimalBin = join(testDir, 'minimal-bin');
      mkdirSync(minimalBin, { recursive: true });
      for (const cmd of ['bash', 'dirname']) {
        const cmdPath = execFileSync('which', [cmd], { encoding: 'utf-8' }).trim();
        symlinkSync(cmdPath, join(minimalBin, cmd));
      }

      const { runnerDir } = copyRunnerLayout(testDir);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: minimalBin,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without podman');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('podman is required');
        expect(error.status).not.toBe(0);
      }
    });
  });
});
