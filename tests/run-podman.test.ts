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
 * credential checks, and delegation to the harness repo's dev/run-container.sh.
 * Podman is mocked via a fake podman script placed on PATH.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'run-podman.sh');

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
 * Creates a mock podman script that records invocations.
 */
function createMockPodman(binDir: string): string {
  const mockBinDir = join(binDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });

  const logFile = join(binDir, 'podman-invocations.log');

  const mockScript = `#!/usr/bin/env bash
echo "$@" >> "${logFile}"
exit 0
`;

  const mockPath = join(mockBinDir, 'podman');
  writeFileSync(mockPath, mockScript);
  chmodSync(mockPath, 0o755);
  return mockBinDir;
}

/**
 * Creates a minimal harness repo structure with dev/run-container.sh
 * so the script can resolve and validate paths.
 */
function createHarnessRepo(baseDir: string): string {
  const harnessDir = join(baseDir, 'ai-agentic-loop-harness');
  mkdirSync(join(harnessDir, 'dev'), { recursive: true });

  // Create a minimal run-container.sh that the run-podman script delegates to.
  // This script records the env vars it receives so we can verify they are
  // passed through correctly.
  const runScript = `#!/usr/bin/env bash
# Minimal run-container.sh for testing
set -euo pipefail

echo "[run-container] HARNESS_WORKSPACE=\${HARNESS_WORKSPACE:-<unset>}"
echo "[run-container] HARNESS_AGENT_RUNTIME=\${HARNESS_AGENT_RUNTIME:-<unset>}"
echo "[run-container] HARNESS_IMAGE_TAG=\${HARNESS_IMAGE_TAG:-<unset>}"
echo "[run-container] HARNESS_MAX_ITERATIONS=\${HARNESS_MAX_ITERATIONS:-<unset>}"
echo "[run-container] HARNESS_TIME_LIMIT_MINUTES=\${HARNESS_TIME_LIMIT_MINUTES:-<unset>}"
echo "[run-container] OLLAMA_HOST=\${OLLAMA_HOST:-<unset>}"
echo "[run-container] OLLAMA_MODELS=\${OLLAMA_MODELS:-<unset>}"
echo "[run-container] KILO_API_KEY=\${KILO_API_KEY:-<unset>}"
echo "[run-container] CODEX_API_KEY=\${CODEX_API_KEY:-<unset>}"
echo "[run-container] OPENROUTER_API_KEY=\${OPENROUTER_API_KEY:-<unset>}"

if ! command -v podman > /dev/null 2>&1; then
  echo "ERROR: podman is required"
  exit 1
fi

# Simulate running the container
podman run --rm --name "harness-test" \\
  -v "\${HARNESS_WORKSPACE}:/workspace:Z" \\
  -e "HARNESS_AGENT_RUNTIME=\${HARNESS_AGENT_RUNTIME}" \\
  "\${HARNESS_IMAGE_TAG:-harness:latest}"

echo "Container run complete"
`;
  writeFileSync(join(harnessDir, 'dev', 'run-container.sh'), runScript);
  chmodSync(join(harnessDir, 'dev', 'run-container.sh'), 0o755);

  return harnessDir;
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

  describe('path resolution', () => {
    it('resolves harness repo path relative to runner repo', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('ai-agentic-loop-harness');
      expect(content).toContain('HARNESS_ROOT');
    });

    it('resolves harness run script path', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('dev/run-container.sh');
    });
  });

  describe('harness repo validation', () => {
    it('fails when harness repo directory does not exist', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      // Create runner dir WITHOUT harness repo
      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without harness repo');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('harness repository not found');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails when harness run script is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      const workspaceDir = createWorkspace(testDir);

      // Create harness dir WITHOUT dev/run-container.sh
      const harnessDir = join(testDir, 'ai-agentic-loop-harness');
      mkdirSync(harnessDir, { recursive: true });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without run script');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('run script not found');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('HARNESS_WORKSPACE validation', () => {
    it('fails fast when HARNESS_WORKSPACE is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
        expect(output).toContain('Unsupported HARNESS_AGENT_RUNTIME');
        expect(output).toContain('unsupported-runtime');
        expect(error.status).not.toBe(0);
      }
    });

    it('accepts all supported runtime values', () => {
      const supportedRuntimes = ['mock', 'droid', 'ollama-droid', 'kilo', 'codex'];

      for (const runtime of supportedRuntimes) {
        const testDir = createTempDir();
        const mockBinDir = createMockPodman(testDir);
        createHarnessRepo(testDir);
        const workspaceDir = createWorkspace(testDir);

        const runnerDir = join(testDir, 'ai-agentic-loop-runner');
        mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
        writeFileSync(
          join(runnerDir, 'scripts', 'run-podman.sh'),
          readFileSync(SCRIPT_PATH, 'utf-8'),
        );
        chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

        // Build env vars based on runtime requirements
        const env: Record<string, string> = {
          ...process.env,
          PATH: `${mockBinDir}:${process.env.PATH}`,
          HARNESS_WORKSPACE: workspaceDir,
          HARNESS_AGENT_RUNTIME: runtime,
        };

        // Add required credentials for runtimes that need them
        if (runtime === 'ollama-droid') {
          env.OLLAMA_HOST = 'http://localhost:11434';
          env.OLLAMA_MODELS = 'llama3';
        }
        if (runtime === 'kilo') {
          env.KILO_API_KEY = 'test-kilo-key';
        }
        if (runtime === 'codex') {
          env.CODEX_API_KEY = 'test-codex-key';
          env.OPENROUTER_API_KEY = 'test-openrouter-key';
        }

        // Should not throw for supported runtimes with required credentials
        const result = execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'run-podman.sh')],
          {
            encoding: 'utf-8',
            env,
            cwd: runnerDir,
          },
        );

        expect(result).toContain(`HARNESS_AGENT_RUNTIME=${runtime}`);
      }
    });
  });

  describe('runtime-specific credential validation', () => {
    it('fails for ollama-droid when OLLAMA_HOST is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'ollama-droid',
            OLLAMA_MODELS: 'llama3',
            // OLLAMA_HOST intentionally not set
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without OLLAMA_HOST');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('OLLAMA_HOST is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for ollama-droid when OLLAMA_MODELS is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'run-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'ollama-droid',
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
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
        expect(output).toContain('KILO_API_KEY is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for codex when CODEX_API_KEY is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
        expect(output).toContain('CODEX_API_KEY is required');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails for codex when OPENROUTER_API_KEY is missing', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
        expect(output).toContain('OPENROUTER_API_KEY is required');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('mock runtime support', () => {
    it('runs successfully with mock runtime and no extra credentials', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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

      expect(result).toContain('HARNESS_AGENT_RUNTIME=mock');
      expect(result).toContain('Container run complete');
    });
  });

  describe('command emission and delegation', () => {
    it('delegates to harness dev/run-container.sh', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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

      // Verify the harness run-container.sh was invoked (it emits [run-container] prefix)
      expect(result).toContain('[run-container]');
      expect(result).toContain('Container run complete');
    });

    it('passes HARNESS_WORKSPACE through to run-container.sh', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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

      expect(result).toContain(`HARNESS_WORKSPACE=${workspaceDir}`);
    });

    it('passes HARNESS_AGENT_RUNTIME through to run-container.sh', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'droid',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('HARNESS_AGENT_RUNTIME=droid');
    });

    it('passes optional env vars through to run-container.sh', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
            HARNESS_IMAGE_TAG: 'harness:custom',
            HARNESS_MAX_ITERATIONS: '5',
            HARNESS_TIME_LIMIT_MINUTES: '30',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('HARNESS_IMAGE_TAG=harness:custom');
      expect(result).toContain('HARNESS_MAX_ITERATIONS=5');
      expect(result).toContain('HARNESS_TIME_LIMIT_MINUTES=30');
    });

    it('emits run-podman log prefix', () => {
      const testDir = createTempDir();
      const mockBinDir = createMockPodman(testDir);
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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

      expect(result).toContain('[run-podman]');
    });
  });

  describe('podman validation', () => {
    it('fails with clear error when podman is not on PATH', () => {
      const testDir = createTempDir();
      createHarnessRepo(testDir);
      const workspaceDir = createWorkspace(testDir);

      // Create a minimal bin directory with only bash and needed utils (no podman)
      const minimalBin = join(testDir, 'minimal-bin');
      mkdirSync(minimalBin, { recursive: true });
      for (const cmd of ['bash', 'dirname', 'mkdir']) {
        const cmdPath = execFileSync('which', [cmd], { encoding: 'utf-8' }).trim();
        symlinkSync(cmdPath, join(minimalBin, cmd));
      }

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'run-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'run-podman.sh'), 0o755);

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
        // The error comes from the harness run-container.sh which checks for podman
        expect(output).toContain('podman is required');
        expect(error.status).not.toBe(0);
      }
    });
  });
});
