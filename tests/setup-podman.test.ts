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
 * Integration tests for scripts/setup-podman.sh
 *
 * These tests verify the script structure, path resolution, validation,
 * idempotency, and direct podman build command emission without requiring
 * a real container build. Podman is mocked via a fake podman script placed
 * on PATH.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'setup-podman.sh');

// Track temp dirs for cleanup
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'runner-setup-podman-test-'));
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
 * Creates a mock podman script that records invocations and returns
 * controlled output. Returns the bin directory to add to PATH.
 */
function createMockPodman(
  binDir: string,
  options: {
    imageExists?: boolean;
    failBuild?: boolean;
  } = {},
): { binDir: string; logFile: string } {
  const mockBinDir = join(binDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });

  const logFile = join(binDir, 'podman-invocations.log');

  // Default: image does not exist (so build proceeds)
  const imageExists = options.imageExists ?? false;
  const failBuild = options.failBuild ?? false;

  const mockScript = `#!/usr/bin/env bash
# Mock podman for testing setup-podman.sh
printf '%s\n' "$*" >> "${logFile}"

case "$1" in
  image)
    if [ "$2" = "inspect" ]; then
      if [ "${imageExists}" = "true" ]; then
        echo "sha256:abc123def456"
        exit 0
      else
        echo "Error: image not found" >&2
        exit 125
      fi
    fi
    ;;
  build)
    if [ "${failBuild}" = "true" ]; then
      echo "Build failed" >&2
      exit 1
    fi
    echo "Building image..."
    exit 0
    ;;
  *)
    echo "Unknown podman command: $1" >&2
    exit 1
    ;;
esac
`;

  const mockPath = join(mockBinDir, 'podman');
  writeFileSync(mockPath, mockScript);
  chmodSync(mockPath, 0o755);
  return { binDir: mockBinDir, logFile };
}

/**
 * Creates a minimal harness repo structure with a Containerfile so the
 * script can resolve and validate paths.
 */
function createHarnessRepo(baseDir: string): string {
  const harnessDir = join(baseDir, 'ai-agentic-loop-harness');
  mkdirSync(harnessDir, { recursive: true });

  writeFileSync(
    join(harnessDir, 'Containerfile'),
    'FROM node:22-alpine\n',
  );

  return harnessDir;
}

describe('scripts/setup-podman.sh', () => {
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

    it('resolves harness Containerfile path', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('Containerfile');
    });
  });

  describe('podman validation', () => {
    it('fails with clear error when podman is not on PATH', () => {
      const testDir = createTempDir();
      createHarnessRepo(testDir);

      const minimalBin = join(testDir, 'minimal-bin');
      mkdirSync(minimalBin, { recursive: true });
      for (const cmd of ['bash', 'dirname', 'mkdir']) {
        const cmdPath = execFileSync('which', [cmd], { encoding: 'utf-8' }).trim();
        symlinkSync(cmdPath, join(minimalBin, cmd));
      }

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'setup-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: minimalBin,
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

  describe('harness repo validation', () => {
    it('fails when harness repo directory does not exist', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'setup-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
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

    it('fails when harness Containerfile is missing', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const harnessDir = join(testDir, 'ai-agentic-loop-harness');
      mkdirSync(harnessDir, { recursive: true });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'setup-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed without Containerfile');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('Containerfile not found');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('workspace directory creation', () => {
    it('creates workspace/ directory when it does not exist', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const workspaceDir = join(runnerDir, 'workspace');
      expect(existsSync(workspaceDir)).toBe(false);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(existsSync(workspaceDir)).toBe(true);
      expect(result).toContain('Creating workspace directory');
    });

    it('is idempotent when workspace/ already exists', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const workspaceDir = join(runnerDir, 'workspace');
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(join(workspaceDir, 'existing-file.txt'), 'hello');

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(existsSync(workspaceDir)).toBe(true);
      expect(existsSync(join(workspaceDir, 'existing-file.txt'))).toBe(true);
      expect(result).toContain('Workspace directory already exists');
    });
  });

  describe('idempotency', () => {
    it('skips rebuild when image already exists', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: true });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('skipping build');
      expect(result).not.toContain('Building image');
    });

    it('rebuilds when NO_CACHE=true even if image exists', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: true });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            NO_CACHE: 'true',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Building image');
      expect(result).not.toContain('skipping build');
    });

    it('builds when image does not exist', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Building image');
      expect(result).not.toContain('skipping build');
    });
  });

  describe('direct podman build', () => {
    it('does not delegate to harness/dev/build-container.sh', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('built successfully');
      expect(result).not.toContain('[build-container]');
    });

    it('passes AGENT_RUNTIME as build arg', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir, logFile } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            AGENT_RUNTIME: 'kilo',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('AGENT_RUNTIME=kilo');

      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('build');
      expect(invocations).toContain('--build-arg');
      expect(invocations).toContain('AGENT_RUNTIME=kilo');
    });

    it('uses the harness repo as build context', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir, logFile } = createMockPodman(testDir, { imageExists: false });
      const harnessDir = createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(existsSync(join(harnessDir, 'Containerfile'))).toBe(true);
      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('ai-agentic-loop-harness/Containerfile');
      expect(invocations).toContain('ai-agentic-loop-harness');
    });

    it('propagates build failures', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, {
        imageExists: false,
        failBuild: true,
      });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      try {
        execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'setup-podman.sh')],
          {
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${mockBinDir}:${process.env.PATH}`,
            },
            cwd: runnerDir,
          },
        );
        expect.unreachable('Script should have failed when build fails');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('Build failed');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('AGENT_RUNTIME environment variable', () => {
    it('defaults to mock when AGENT_RUNTIME is not set', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir, logFile } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('AGENT_RUNTIME=mock');
      const invocations = readFileSync(logFile, 'utf-8');
      expect(invocations).toContain('--build-arg');
      expect(invocations).toContain('AGENT_RUNTIME=mock');
    });

    it('rejects unsupported AGENT_RUNTIME values', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: true });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      try {
        execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'setup-podman.sh')],
          {
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${mockBinDir}:${process.env.PATH}`,
              AGENT_RUNTIME: 'unknown-runtime',
            },
            cwd: runnerDir,
          },
        );
        expect.unreachable('Script should have failed for unsupported runtime');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('unsupported AGENT_RUNTIME');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('command emission', () => {
    it('emits setup-podman log prefix', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: true });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('[setup-podman]');
    });

    it('emits setup complete message', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { imageExists: false });
      createHarnessRepo(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'setup-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'setup-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'setup-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Setup complete');
    });
  });
});
