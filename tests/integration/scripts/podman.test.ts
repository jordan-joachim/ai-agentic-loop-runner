import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const SETUP_SCRIPT = path.join(SCRIPT_DIR, 'setup-podman.sh');
const RUN_SCRIPT = path.join(SCRIPT_DIR, 'run-podman.sh');
const WATCH_SCRIPT = path.join(SCRIPT_DIR, 'watch-podman.sh');

function runShellCheck(scriptPath: string): void {
  const output = execFileSync('bash', ['-n', scriptPath], { encoding: 'utf-8' });
  expect(output).toBe('');
}

function runScript(
  scriptPath: string,
  args: string[] = [],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [scriptPath, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
  } catch (err) {
    status = (err as Error & { status?: number }).status ?? 1;
    stdout = (err as Error & { stdout?: string }).stdout ?? '';
    stderr = (err as Error & { stderr?: string }).stderr ?? '';
  }
  return { stdout, stderr, status };
}

describe('setup-podman.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(SETUP_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(SETUP_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(SETUP_SCRIPT);
  });

  it('is idempotent when inputs have not changed', () => {
    runScript(SETUP_SCRIPT);
    const result = runScript(SETUP_SCRIPT);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skipping build|Using existing image/);
  });
});

describe('run-podman.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(RUN_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(RUN_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(RUN_SCRIPT);
  });

  it('validates missing OLLAMA_HOST', () => {
    const result = runScript(RUN_SCRIPT, [], {
      OLLAMA_HOST: '',
      OLLAMA_MODELS: 'codellama:7b',
      OLLAMA_API_KEY: 'test-key',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('OLLAMA_HOST');
  });

  it('validates missing OLLAMA_MODELS', () => {
    const result = runScript(RUN_SCRIPT, [], {
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: '',
      OLLAMA_API_KEY: 'test-key',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/OLLAMA_MODELS|OLLAMA_MODEL/);
  });

  it('validates missing OLLAMA_API_KEY', () => {
    const result = runScript(RUN_SCRIPT, [], {
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: 'codellama:7b',
      OLLAMA_API_KEY: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('OLLAMA_API_KEY');
  });

  it('runs podman with required env vars and mounts', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('HARNESS_AGENT_RUNTIME=ollama-droid');
    expect(content).toContain('OLLAMA_HOST');
    expect(content).toContain('OLLAMA_MODELS');
    expect(content).toContain('OLLAMA_API_KEY');
    expect(content).toContain('DROID_DOER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('--name agentic-loop-fvt');
    expect(content).toContain('podman run');
  });

  it('generates a harness-compatible plan.yaml from the prompt', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('generate-plan.js');
    expect(content).not.toContain('cp "${PROMPT_FILE}" "${WORKSPACE_DIR}/plan.yaml"');
  });

  it('prints the watch command', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('watch-podman.sh');
    expect(content).toContain('podman logs -f agentic-loop-fvt');
  });
});

describe('watch-podman.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(WATCH_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(WATCH_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(WATCH_SCRIPT);
  });

  it('contains expected podman commands', () => {
    const content = fsSync.readFileSync(WATCH_SCRIPT, 'utf-8');
    expect(content).toContain('podman logs -f agentic-loop-fvt');
    expect(content).toContain('podman exec agentic-loop-fvt');
    expect(content).toContain('harness.log');
    expect(content).toContain('doer-*.log');
    expect(content).toContain('reviewer-*.log');
  });
});
