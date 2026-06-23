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
 * Integration tests for scripts/watch-podman.sh
 *
 * These tests verify the script structure, validation, container discovery,
 * and command emission without requiring a real running container.
 * Podman is mocked via a fake podman script placed on PATH.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'watch-podman.sh');

// Track temp dirs for cleanup
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'runner-watch-podman-test-'));
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
    containerExists?: boolean;
    containerRunning?: boolean;
    containerNames?: string[];
  } = {},
): { binDir: string; logFile: string } {
  const mockBinDir = join(binDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });

  const logFile = join(binDir, 'podman-invocations.log');

  const containerExists = options.containerExists ?? true;
  const containerRunning = options.containerRunning ?? true;
  const containerNames = options.containerNames ?? ['harness-12345-67890'];

  // Build a bash array literal from the TypeScript array.
  const bashArrayLiteral = containerNames.map((n) => `"${n}"`).join(' ');

  const mockScript = `#!/usr/bin/env bash
# Mock podman for testing watch-podman.sh
printf '%s\n' "$*" >> "${logFile}"

case "$1" in
  container)
    if [ "$2" = "inspect" ]; then
      if [ "${containerExists}" = "true" ]; then
        if [ "${containerRunning}" = "true" ]; then
          echo "running"
        else
          echo "exited"
        fi
        exit 0
      else
        echo "Error: no such container" >&2
        exit 125
      fi
    fi
    ;;
  ps)
    containerNames=(${bashArrayLiteral})
    for name in "\${containerNames[@]}"; do
      echo "\${name}"
    done
    exit 0
    ;;
  logs)
    echo "[mock] podman logs -f $2"
    sleep 0.1
    exit 0
    ;;
  exec)
    shift
    echo "[mock] podman exec $*"
    sleep 0.1
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

describe('scripts/watch-podman.sh', () => {
  afterAll(() => {
    cleanup();
  });

  describe('script structure', () => {
    it('exists and is executable', () => {
      expect(existsSync(SCRIPT_PATH)).toBe(true);
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

  describe('podman validation', () => {
    it('fails with clear error when podman is not on PATH', () => {
      const testDir = createTempDir();

      const minimalBin = join(testDir, 'minimal-bin');
      mkdirSync(minimalBin, { recursive: true });
      for (const cmd of ['bash', 'dirname', 'mkdir']) {
        const cmdPath = execFileSync('which', [cmd], { encoding: 'utf-8' }).trim();
        symlinkSync(cmdPath, join(minimalBin, cmd));
      }

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'watch-podman.sh'), 'test-container'], {
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

    it('validates podman before attempting container discovery', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, {
        containerNames: [],
      });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'watch-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed with no containers');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('No container name provided');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('container validation', () => {
    it('fails when container does not exist', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, { containerExists: false });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      try {
        execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'watch-podman.sh'), 'nonexistent-container'],
          {
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${mockBinDir}:${process.env.PATH}`,
            },
            cwd: runnerDir,
          },
        );
        expect.unreachable('Script should have failed for nonexistent container');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('does not exist');
        expect(error.status).not.toBe(0);
      }
    });

    it('fails when container is not running', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, {
        containerExists: true,
        containerRunning: false,
      });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      try {
        execFileSync(
          'bash',
          [join(runnerDir, 'scripts', 'watch-podman.sh'), 'stopped-container'],
          {
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${mockBinDir}:${process.env.PATH}`,
            },
            cwd: runnerDir,
          },
        );
        expect.unreachable('Script should have failed for stopped container');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('not running');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('container name resolution', () => {
    it('accepts container name as positional argument', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'my-harness-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('my-harness-container');
    });

    it('accepts container name via HARNESS_CONTAINER_NAME env var', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_CONTAINER_NAME: 'env-container',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('env-container');
    });

    it('HARNESS_CONTAINER_NAME env var takes precedence over positional argument', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'positional-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
            HARNESS_CONTAINER_NAME: 'env-container',
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('env-container');
      expect(result).not.toContain('positional-container');
    });

    it('discovers container when no name is provided', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, {
        containerNames: ['harness-11111-22222', 'harness-33333-44444'],
      });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh')],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Discovered container');
      expect(result).toContain('harness-33333-44444');
    });

    it('fails when no container name and no running harness containers', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir, {
        containerNames: [],
      });

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      try {
        execFileSync('bash', [join(runnerDir, 'scripts', 'watch-podman.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        });
        expect.unreachable('Script should have failed with no containers');
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; status?: number };
        const output = (error.stderr || '') + (error.stdout || '');
        expect(output).toContain('No container name provided');
        expect(error.status).not.toBe(0);
      }
    });
  });

  describe('command emission', () => {
    it('emits podman logs -f for container stdout/stderr', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'test-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('podman logs -f test-container');
    });

    it('emits podman exec tail for harness.log and agent logs', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'test-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('podman exec');
      expect(result).toContain('tail -f');
      expect(result).toContain('harness.log');
      expect(result).toContain('iter-*/doer.log');
      expect(result).toContain('iter-*/reviewer.log');
    });

    it('emits watch-podman log prefix', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'test-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('[watch-podman]');
    });

    it('emits watching logs message', () => {
      const testDir = createTempDir();
      const { binDir: mockBinDir } = createMockPodman(testDir);

      const runnerDir = join(testDir, 'ai-agentic-loop-runner');
      mkdirSync(join(runnerDir, 'scripts'), { recursive: true });
      writeFileSync(
        join(runnerDir, 'scripts', 'watch-podman.sh'),
        readFileSync(SCRIPT_PATH, 'utf-8'),
      );
      chmodSync(join(runnerDir, 'scripts', 'watch-podman.sh'), 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'watch-podman.sh'), 'test-container'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          cwd: runnerDir,
        },
      );

      expect(result).toContain('Watching logs for container');
    });
  });

  describe('log file patterns', () => {
    it('tails harness.log inside the container', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('harness.log');
    });

    it('tails iter-*/doer.log inside the container', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('iter-*/doer.log');
    });

    it('tails iter-*/reviewer.log inside the container', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('iter-*/reviewer.log');
    });

    it('uses correct log filenames matching harness output (doer.log, not doer-*.log)', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('iter-*/doer.log');
      expect(content).toContain('iter-*/reviewer.log');
      expect(content).not.toContain('doer-*.log');
      expect(content).not.toContain('reviewer-*.log');
    });
  });

  describe('podman logs -f support', () => {
    it('script contains podman logs -f command', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('podman logs -f');
    });

    it('script contains podman exec for tailing logs inside container', () => {
      const content = readFileSync(SCRIPT_PATH, 'utf-8');
      expect(content).toContain('podman exec');
      expect(content).toContain('tail -f');
    });
  });
});
