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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = resolve(__dirname, '..', '..', 'scripts');

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'runner-scripts-test-'));
  tempDirs.push(dir);
  return dir;
}

function cleanup() {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createWorkspace(baseDir: string): string {
  const workspaceDir = join(baseDir, 'workspace');
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(
    join(workspaceDir, 'plan.yaml'),
    'meta:\n  title: Test Plan\n  version: "2"\n',
  );
  writeFileSync(
    join(workspaceDir, 'rules.yaml'),
    'rules:\n  - id: RULE-001\n    name: Test Rule\n',
  );
  return workspaceDir;
}

function copyRunnerLayout(baseDir: string): { runnerDir: string } {
  const runnerDir = join(baseDir, 'ai-agentic-loop-runner');
  const scriptsDir = join(runnerDir, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });

  for (const script of [
    'run-direct.sh',
    'run-podman.sh',
    'run-code-engine-job.sh',
    'run-code-engine-fleet.sh',
  ]) {
    const src = join(SCRIPTS_DIR, script);
    const dst = join(scriptsDir, script);
    writeFileSync(dst, readFileSync(src, 'utf-8'));
    chmodSync(dst, 0o755);
  }

  const distPath = resolve(__dirname, '..', '..', 'dist');
  const distLink = join(runnerDir, 'dist');
  symlinkSync(distPath, distLink);

  return { runnerDir };
}

function createFakeHarness(baseDir: string, runnerDir: string): void {
  const harnessDir = join(baseDir, 'ai-agentic-loop-harness');
  const binDir = join(harnessDir, 'bin');
  mkdirSync(binDir, { recursive: true });

  const harnessScript = [
    '#!/usr/bin/env bash',
    'WORKSPACE=""',
    'NEXT=false',
    'for arg in "$@"; do',
    '  if [ "$NEXT" = "true" ]; then',
    '    WORKSPACE="$arg"',
    '    NEXT=false',
    '  fi',
    '  if [ "$arg" = "--workspace" ]; then',
    '    NEXT=true',
    '  fi',
    'done',
    'mkdir -p "$WORKSPACE"',
    'echo "status: done" > "$WORKSPACE/result.yaml"',
    'echo "iterations: 3" >> "$WORKSPACE/result.yaml"',
    'exit 0',
  ].join('\n');
  const harnessPath = join(binDir, 'harness');
  writeFileSync(harnessPath, harnessScript);
  chmodSync(harnessPath, 0o755);

  for (const script of [
    'run-direct.sh',
    'run-podman.sh',
    'run-code-engine-job.sh',
    'run-code-engine-fleet.sh',
  ]) {
    const scriptPath = join(runnerDir, 'scripts', script);
    const content = readFileSync(scriptPath, 'utf-8');
    writeFileSync(
      scriptPath,
      content.replace(
        'HARNESS_ROOT="${RUNNER_ROOT}/../ai-agentic-loop-harness"',
        `HARNESS_ROOT="${harnessDir}"`,
      ),
    );
  }
}

function createFakePodman(binDir: string): void {
  const podmanPath = join(binDir, 'podman');
  const script = [
    '#!/usr/bin/env bash',
    'WORKSPACE=""',
    'while [ $# -gt 0 ]; do',
    '  case "$1" in',
    '    -v)',
    '      WORKSPACE="${2%%:*}"',
    '      shift 2',
    '      ;;',
    '    --rm|run|--name)',
    '      shift',
    '      ;;',
    '    -e)',
    '      shift 2',
    '      ;;',
    '    *)',
    '      if [ -z "$WORKSPACE" ] && [ -d "$1" ]; then',
    '        WORKSPACE="$1"',
    '      fi',
    '      shift',
    '      ;;',
    '  esac',
    'done',
    'if [ -n "$WORKSPACE" ]; then',
    '  echo "status: done" > "$WORKSPACE/result.yaml"',
    '  echo "iterations: 2" >> "$WORKSPACE/result.yaml"',
    'fi',
    'exit 0',
  ].join('\n');
  writeFileSync(podmanPath, script);
  chmodSync(podmanPath, 0o755);
}

describe('runner scripts integration', () => {
  afterAll(() => {
    cleanup();
  });

  describe('run-direct.sh', () => {
    it('validates config and writes agents.json before invoking harness', () => {
      const testDir = createTempDir();
      const { runnerDir } = copyRunnerLayout(testDir);
      const workspaceDir = createWorkspace(testDir);
      createFakeHarness(testDir, runnerDir);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-direct.sh')],
        {
          encoding: 'utf-8',
          cwd: runnerDir,
          env: {
            ...process.env,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
        },
      );

      expect(result).toContain('[run-direct]');
      expect(result).toContain('Validating agent config');
      expect(result).toContain('Wrote workspace/config/agents.json');
      expect(existsSync(join(workspaceDir, 'config', 'agents.json'))).toBe(true);
      expect(result).toContain('Result status: done');
      expect(result).toContain('Result iterations: 3');
    });
  });

  describe('run-podman.sh', () => {
    it('validates config, writes agents.json, and reports result.yaml', () => {
      const testDir = createTempDir();
      const { runnerDir } = copyRunnerLayout(testDir);
      const workspaceDir = createWorkspace(testDir);
      const fakeBin = join(testDir, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      createFakePodman(fakeBin);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-podman.sh')],
        {
          encoding: 'utf-8',
          cwd: runnerDir,
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH}`,
            HARNESS_WORKSPACE: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
          },
        },
      );

      expect(result).toContain('[run-podman]');
      expect(result).toContain('Validating agent config');
      expect(result).toContain('Wrote workspace/config/agents.json');
      expect(existsSync(join(workspaceDir, 'config', 'agents.json'))).toBe(true);
      expect(result).toContain('Result status: done');
      expect(result).toContain('Result iterations: 2');
    });
  });

  describe('run-code-engine-job.sh', () => {
    it('validates config and writes agents.json before delegating', () => {
      const testDir = createTempDir();
      const { runnerDir } = copyRunnerLayout(testDir);
      const workspaceDir = createWorkspace(testDir);
      const harnessScriptsDir = join(
        testDir,
        'ai-agentic-loop-harness',
        'scripts',
      );
      mkdirSync(harnessScriptsDir, { recursive: true });

      const harnessScript = join(harnessScriptsDir, 'run-code-engine-job.sh');
      writeFileSync(
        harnessScript,
        `#!/usr/bin/env bash\necho OK > "${testDir}/harness-invoked"\nexit 0\n`,
      );
      chmodSync(harnessScript, 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-code-engine-job.sh')],
        {
          encoding: 'utf-8',
          cwd: runnerDir,
          env: {
            ...process.env,
            HARNESS_WORKSPACE_DIR: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
            IBMCLOUD_API_KEY: 'test-key',
            COS_BUCKET: 'test-bucket',
          },
        },
      );

      expect(result).toContain('[run-code-engine-job]');
      expect(result).toContain('Validating agent config');
      expect(result).toContain('Wrote workspace/config/agents.json');
      expect(existsSync(join(workspaceDir, 'config', 'agents.json'))).toBe(true);
      expect(existsSync(join(testDir, 'harness-invoked'))).toBe(true);
    });
  });

  describe('run-code-engine-fleet.sh', () => {
    it('validates config and writes agents.json before delegating', () => {
      const testDir = createTempDir();
      const { runnerDir } = copyRunnerLayout(testDir);
      const workspaceDir = createWorkspace(testDir);
      const harnessScriptsDir = join(
        testDir,
        'ai-agentic-loop-harness',
        'scripts',
      );
      mkdirSync(harnessScriptsDir, { recursive: true });

      const harnessScript = join(harnessScriptsDir, 'run-fleet.sh');
      writeFileSync(
        harnessScript,
        `#!/usr/bin/env bash\necho OK > "${testDir}/fleet-invoked"\nexit 0\n`,
      );
      chmodSync(harnessScript, 0o755);

      const result = execFileSync(
        'bash',
        [join(runnerDir, 'scripts', 'run-code-engine-fleet.sh')],
        {
          encoding: 'utf-8',
          cwd: runnerDir,
          env: {
            ...process.env,
            HARNESS_WORKSPACE_DIR: workspaceDir,
            HARNESS_AGENT_RUNTIME: 'mock',
            IBMCLOUD_API_KEY: 'test-key',
            COS_BUCKET: 'test-bucket',
            CE_IMAGE: 'us.icr.io/ns/harness:latest',
          },
        },
      );

      expect(result).toContain('[run-code-engine-fleet]');
      expect(result).toContain('Validating agent config');
      expect(result).toContain('Wrote workspace/config/agents.json');
      expect(existsSync(join(workspaceDir, 'config', 'agents.json'))).toBe(true);
      expect(existsSync(join(testDir, 'fleet-invoked'))).toBe(true);
    });
  });
});
