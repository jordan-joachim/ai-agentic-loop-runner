import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const SETUP_SCRIPT = path.join(SCRIPT_DIR, 'setup-codeengine.sh');
const RUN_SCRIPT = path.join(SCRIPT_DIR, 'run-codeengine.sh');
const WATCH_SCRIPT = path.join(SCRIPT_DIR, 'watch-codeengine.sh');

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

describe('setup-codeengine.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(SETUP_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(SETUP_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(SETUP_SCRIPT);
  });

  it('fails when IBMCLOUD_API_KEY is missing', () => {
    const result = runScript(SETUP_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      IBMCLOUD_API_KEY: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('IBMCLOUD_API_KEY');
  });

  it('uses default resource group agenticloop', () => {
    const content = fsSync.readFileSync(SETUP_SCRIPT, 'utf-8');
    expect(content).toContain('CE_RESOURCE_GROUP:-agenticloop');
  });

  it('contains all provisioning steps', () => {
    const content = fsSync.readFileSync(SETUP_SCRIPT, 'utf-8');
    expect(content).toContain('ce project create');
    expect(content).toContain('cos bucket-create');
    expect(content).toContain('iam service-id-create');
    expect(content).toContain('iam service-policy-create');
    expect(content).toContain('ce secret create');
    expect(content).toContain('ce job create');
  });

  it('prints what was created or found', () => {
    const content = fsSync.readFileSync(SETUP_SCRIPT, 'utf-8');
    expect(content).toContain('already exists');
    expect(content).toContain('Code Engine setup complete');
  });
});

describe('run-codeengine.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(RUN_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(RUN_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(RUN_SCRIPT);
  });

  it('fails when IBMCLOUD_API_KEY is missing', () => {
    const result = runScript(RUN_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      IBMCLOUD_API_KEY: '',
      COS_BUCKET: 'test-bucket',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('IBMCLOUD_API_KEY');
  });

  it('fails when COS_BUCKET is missing', () => {
    const result = runScript(RUN_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      IBMCLOUD_API_KEY: 'fake-key',
      COS_BUCKET: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('COS_BUCKET');
  });

  it('uploads plan.yaml to COS and submits a job run', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('cos object-put');
    expect(content).toContain('ce jobrun submit');
    expect(content).toContain('agentic-loop-run');
  });

  it('generates a harness-compatible plan.yaml from the prompt before upload', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('generate-plan.js');
    expect(content).toContain('--body "${PLAN_SOURCE}"');
    expect(content).not.toContain('--body "${PROMPT_FILE}"');
  });

  it('prints the watch command', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('watch-codeengine.sh');
  });
});

describe('watch-codeengine.sh', () => {
  it('exists and is executable', () => {
    expect(fsSync.existsSync(WATCH_SCRIPT)).toBe(true);
    const stat = fsSync.statSync(WATCH_SCRIPT);
    expect(stat.mode & fsSync.constants.S_IXUSR).not.toBe(0);
  });

  it('passes bash syntax check', () => {
    runShellCheck(WATCH_SCRIPT);
  });

  it('fails when IBMCLOUD_API_KEY is missing', () => {
    const result = runScript(WATCH_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      IBMCLOUD_API_KEY: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('IBMCLOUD_API_KEY');
  });

  it('follows job run logs and prints COS download instructions', () => {
    const content = fsSync.readFileSync(WATCH_SCRIPT, 'utf-8');
    expect(content).toContain('ce jobrun logs -f');
    expect(content).toContain('ibmcloud cos objects');
    expect(content).toContain('ibmcloud cos object-get');
  });
});
