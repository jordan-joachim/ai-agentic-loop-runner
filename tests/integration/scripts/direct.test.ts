import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SETUP_SCRIPT = path.join(SCRIPT_DIR, 'setup-direct.sh');
const RUN_SCRIPT = path.join(SCRIPT_DIR, 'run-direct.sh');
const WATCH_SCRIPT = path.join(SCRIPT_DIR, 'watch-direct.sh');

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

describe('setup-direct.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(SETUP_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(SETUP_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(SETUP_SCRIPT);
  });

  it('is idempotent', () => {
    const result1 = runScript(SETUP_SCRIPT);
    expect(result1.status).toBe(0);
    const result2 = runScript(SETUP_SCRIPT);
    expect(result2.status).toBe(0);
    expect(result2.stdout).toContain('already present');
  });

  it('creates workspace and seeds plan.yaml', () => {
    runScript(SETUP_SCRIPT);
    expect(fsSync.existsSync(path.join(REPO_ROOT, 'workspace', 'plan.yaml'))).toBe(true);
    expect(fsSync.existsSync(path.join(REPO_ROOT, 'workspace', '.droids', 'ollama-droid.md'))).toBe(true);
  });
});

describe('run-direct.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(RUN_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(RUN_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(RUN_SCRIPT);
  });

  it('validates unsupported runtime', () => {
    const result = runScript(RUN_SCRIPT, [], {
      HARNESS_AGENT_RUNTIME: 'unsupported',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('Unsupported HARNESS_AGENT_RUNTIME');
  });

  it('validates missing OLLAMA_HOST for ollama-droid', () => {
    const result = runScript(RUN_SCRIPT, [], {
      HARNESS_AGENT_RUNTIME: 'ollama-droid',
      OLLAMA_HOST: '',
      OLLAMA_MODELS: 'codellama:7b',
      OLLAMA_API_KEY: 'test-key',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('OLLAMA_HOST');
  });

  it('validates missing OLLAMA_MODELS for ollama-droid', () => {
    const result = runScript(RUN_SCRIPT, [], {
      HARNESS_AGENT_RUNTIME: 'ollama-droid',
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: '',
      OLLAMA_API_KEY: 'test-key',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/OLLAMA_MODELS|OLLAMA_MODEL/);
  });

  it('validates missing OLLAMA_API_KEY for ollama-droid', () => {
    const result = runScript(RUN_SCRIPT, [], {
      HARNESS_AGENT_RUNTIME: 'ollama-droid',
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: 'codellama:7b',
      OLLAMA_API_KEY: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('OLLAMA_API_KEY');
  });

  it('accepts deprecated OLLAMA_MODEL fallback', () => {
    const result = runScript(RUN_SCRIPT, [], {
      HARNESS_AGENT_RUNTIME: 'ollama-droid',
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: '',
      OLLAMA_MODEL: 'codellama:7b',
      OLLAMA_API_KEY: 'test-key',
    });
    // The harness binary is not expected to exist in this path in tests, so it fails later.
    expect(result.stderr + result.stdout).not.toContain('OLLAMA_MODELS');
    expect(result.stderr + result.stdout).not.toContain('OLLAMA_MODEL is required');
  });

  it('prints the watch command', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('watch-direct.sh');
  });
});

describe('watch-direct.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(WATCH_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(WATCH_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(WATCH_SCRIPT);
  });

  it('contains the expected tail command', () => {
    const content = fsSync.readFileSync(WATCH_SCRIPT, 'utf-8');
    expect(content).toContain('tail -f');
    expect(content).toContain('harness.log');
    expect(content).toContain('doer-*.log');
    expect(content).toContain('reviewer-*.log');
  });
});
