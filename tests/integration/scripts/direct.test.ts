import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

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
      // Always default to AGENTIC_NO_DOTENV=true so tests cannot accidentally
      // load the user's .env file. Callers may override by passing the
      // variable explicitly.
      env: {
        ...process.env,
        AGENTIC_NO_DOTENV: 'true',
        ...env,
      },
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

  it('seeds a valid harness plan.yaml', async () => {
    runScript(SETUP_SCRIPT);
    const planPath = path.join(REPO_ROOT, 'workspace', 'plan.yaml');
    const content = await fs.readFile(planPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;
    expect(parsed.meta).toMatchObject({
      title: 'IBM CodeEngine samples/ai FVT coverage run',
      version: '2',
      author: 'agentic-harness',
    });
    expect(Array.isArray(parsed.inputs)).toBe(true);
    expect(parsed.phases).toBeDefined();
    expect(parsed.rules).toBeDefined();
    expect(Array.isArray(parsed.rules)).toBe(true);
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
      AGENTIC_NO_DOTENV: 'true',
      HARNESS_AGENT_RUNTIME: 'unsupported',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('Unsupported HARNESS_AGENT_RUNTIME');
  });

  it('validates missing OLLAMA_HOST for ollama-droid', () => {
    const result = runScript(RUN_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
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
      AGENTIC_NO_DOTENV: 'true',
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
      AGENTIC_NO_DOTENV: 'true',
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
      AGENTIC_NO_DOTENV: 'true',
      HARNESS_AGENT_RUNTIME: 'ollama-droid',
      OLLAMA_HOST: 'http://localhost:11434',
      OLLAMA_MODELS: '',
      OLLAMA_MODEL: 'codellama:7b',
      OLLAMA_API_KEY: 'test-key',
      // Avoid invoking the real droid/Ollama runtime in tests.
      HARNESS_MAX_ITERATIONS: '0',
      HARNESS_TIME_LIMIT_MINUTES: '0',
    });
    expect(result.stderr + result.stdout).not.toContain('OLLAMA_MODELS');
    expect(result.stderr + result.stdout).not.toContain('OLLAMA_MODEL is required');
  });

  it('validates missing KILO_API_KEY for kilo', () => {
    const result = runScript(RUN_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      HARNESS_AGENT_RUNTIME: 'kilo',
      KILO_API_KEY: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('KILO_API_KEY');
  });

  it('accepts kilo runtime with valid KILO_API_KEY and passes optional provider/model', () => {
    const result = runScript(
      RUN_SCRIPT,
      [],
      {
        AGENTIC_NO_DOTENV: 'true',
        HARNESS_AGENT_RUNTIME: 'kilo',
        KILO_API_KEY: 'test-kilo-key',
        KILO_PROVIDER: 'anthropic',
        KILO_MODEL: 'claude-sonnet-4-20250514',
        // Avoid invoking the real Kilo runtime in tests by setting max iterations to 0.
        HARNESS_MAX_ITERATIONS: '0',
        HARNESS_TIME_LIMIT_MINUTES: '0',
      },
    );
    expect(result.stderr + result.stdout).not.toContain('KILO_API_KEY is required');
    expect(result.stderr + result.stdout).toContain('Running harness with runtime: kilo');
  });

  it('generates a valid plan.yaml and rules.yaml before invoking the harness', () => {
    const planPath = path.join(REPO_ROOT, 'workspace', 'plan.yaml');
    const rulesPath = path.join(REPO_ROOT, 'workspace', 'rules.yaml');
    try {
      fsSync.rmSync(planPath, { force: true });
      fsSync.rmSync(rulesPath, { force: true });
    } catch {
      // ignore
    }

    const result = runScript(RUN_SCRIPT, [], {
      AGENTIC_NO_DOTENV: 'true',
      HARNESS_AGENT_RUNTIME: 'mock',
    });

    expect(fsSync.existsSync(planPath)).toBe(true);
    expect(fsSync.existsSync(rulesPath)).toBe(true);

    const planContent = fsSync.readFileSync(planPath, 'utf-8');
    const parsedPlan = yaml.load(planContent) as Record<string, unknown>;
    expect(parsedPlan.meta).toMatchObject({
      title: 'IBM CodeEngine samples/ai FVT coverage run',
      version: '2',
      author: 'agentic-harness',
    });
    expect(Array.isArray(parsedPlan.inputs)).toBe(true);
    expect(parsedPlan.phases).toBeDefined();
    expect(Array.isArray(parsedPlan.rules)).toBe(true);

    const rulesContent = fsSync.readFileSync(rulesPath, 'utf-8');
    const parsedRules = yaml.load(rulesContent) as Record<string, unknown>;
    expect(Array.isArray(parsedRules.rules)).toBe(true);
    expect(parsedRules.rules).toHaveLength(2);
    expect((parsedRules.rules as Record<string, unknown>[])[0]).toMatchObject({
      id: 'RULE-001',
      name: 'Keep tests in sample language',
      required: true,
      check: 'language matches',
    });
    expect((parsedRules.rules as Record<string, unknown>[])[1]).toMatchObject({
      id: 'RULE-002',
      name: 'Do not modify application source',
      required: true,
      check: 'source diff empty',
    });

    const planRuleIds = (parsedPlan.rules as Record<string, unknown>[]).map(
      (r) => r.rule_id as string,
    );
    const ruleIds = (parsedRules.rules as Record<string, unknown>[]).map(
      (r) => r.id as string,
    );
    expect(planRuleIds).toEqual(ruleIds);
    expect(planRuleIds).toContain('RULE-001');
    expect(planRuleIds).toContain('RULE-002');

    // Should not see the original harness validation error.
    expect(result.stderr + result.stdout).not.toContain('Plan validation failed');
    expect(result.stderr + result.stdout).not.toContain('is not referenced in the plan');
  });

  it('uses HARNESS_PROMPT_FILE, HARNESS_WORKSPACE_DIR, and HARNESS_RULES_FILE from .env', () => {
    const envPath = path.join(REPO_ROOT, '.env');
    const backupPath = `${envPath}.testbackup`;
    const originalEnvExists = fsSync.existsSync(envPath);
    if (originalEnvExists) {
      fsSync.renameSync(envPath, backupPath);
    }

    const tmpWorkspace = 'tests/output/env-workspace';
    const tmpRules = 'custom-rules.yaml';
    const tmpPrompt = 'tests/output/env-prompt.md';
    fsSync.mkdirSync(path.join(REPO_ROOT, path.dirname(tmpPrompt)), { recursive: true });
    fsSync.writeFileSync(path.join(REPO_ROOT, tmpPrompt), '# Env Prompt\n\nFVT Coverage Plan from env\n', 'utf-8');

    fsSync.writeFileSync(
      envPath,
      `HARNESS_PROMPT_FILE=${tmpPrompt}\nHARNESS_WORKSPACE_DIR=${tmpWorkspace}\nHARNESS_RULES_FILE=${tmpRules}\n`,
      'utf-8',
    );

    try {
      const result = runScript(RUN_SCRIPT, [], {
        AGENTIC_NO_DOTENV: 'true',
        HARNESS_AGENT_RUNTIME: 'mock',
      });

      expect(fsSync.existsSync(path.join(REPO_ROOT, tmpWorkspace, 'plan.yaml'))).toBe(true);
      expect(fsSync.existsSync(path.join(REPO_ROOT, tmpWorkspace, tmpRules))).toBe(true);
      expect(result.stderr + result.stdout).toContain('Wrote rules to');
    } finally {
      fsSync.rmSync(envPath, { force: true });
      if (originalEnvExists) {
        fsSync.renameSync(backupPath, envPath);
      }
    }
  });

  it('prints the watch command', () => {
    const content = fsSync.readFileSync(RUN_SCRIPT, 'utf-8');
    expect(content).toContain('watch-direct.sh');
  });
});

const EXAMPLE_REPO_SCRIPTS = [
  SETUP_SCRIPT,
  RUN_SCRIPT,
  WATCH_SCRIPT,
  path.join(SCRIPT_DIR, 'setup-podman.sh'),
  path.join(SCRIPT_DIR, 'run-podman.sh'),
  path.join(SCRIPT_DIR, 'watch-podman.sh'),
  path.join(SCRIPT_DIR, 'setup-codeengine.sh'),
  path.join(SCRIPT_DIR, 'run-codeengine.sh'),
  path.join(SCRIPT_DIR, 'watch-codeengine.sh'),
  path.join(SCRIPT_DIR, 'run-local-podman.sh'),
  path.join(SCRIPT_DIR, 'create-pr.sh'),
];

describe('script hardening', () => {
  it('has no absolute /home/joachim paths in scripts', () => {
    for (const script of EXAMPLE_REPO_SCRIPTS) {
      const content = fsSync.readFileSync(script, 'utf-8');
      expect(content).not.toContain('/home/joachim');
    }
  });

  it('loads .env from repo root in each script', () => {
    for (const script of EXAMPLE_REPO_SCRIPTS) {
      const content = fsSync.readFileSync(script, 'utf-8');
      expect(content).toContain('source "${REPO_ROOT}/.env"');
    }
  });
});

describe('.env.example', () => {
  it('exists at the repo root', () => {
    expect(fsSync.existsSync(path.join(REPO_ROOT, '.env.example'))).toBe(true);
  });

  it('contains the expected keys', () => {
    const content = fsSync.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf-8');
    for (const key of [
      'HARNESS_AGENT_RUNTIME',
      'HARNESS_PROMPT_FILE',
      'HARNESS_WORKSPACE_DIR',
      'HARNESS_RULES_FILE',
      'OLLAMA_HOST',
      'OLLAMA_MODELS',
      'OLLAMA_API_KEY',
      'IBMCLOUD_API_KEY',
      'COS_BUCKET',
      'COS_ENDPOINT',
      'CE_PROJECT_NAME',
      'CE_JOB_NAME',
      'GITHUB_TOKEN',
    ]) {
      expect(content).toContain(key);
    }
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
