/**
 * Integration test for VAL-CRED-005:
 * Both .env.example files document every supported HARNESS_AGENT_RUNTIME
 * value and the required credential env vars for each runtime.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HARNESS_REPO_ROOT = path.resolve(EXAMPLE_REPO_ROOT, '..', 'AgenticLoop');

const RUNTIMES = ['mock', 'droid', 'ollama-droid', 'kilo'];
const REQUIRED_OLLAMA_VARS = ['OLLAMA_HOST', 'OLLAMA_MODELS', 'OLLAMA_API_KEY'];
const REQUIRED_KILO_VAR = 'KILO_API_KEY';

function readEnvExample(repoRoot: string): string {
  const filePath = path.join(repoRoot, '.env.example');
  if (!fs.existsSync(filePath)) {
    throw new Error(`.env.example not found at ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function describeRepository(repoRoot: string): string {
  return path.basename(repoRoot);
}

/**
 * Integration test for VAL-CRED-006:
 * The example repo test configuration isolates tests from the user's .env
 * file. The harness CLI can be invoked with AGENTIC_NO_DOTENV=true or by
 * passing a sanitized env map, and the real .env credentials are not loaded.
 */

describe('VAL-CRED-006: tests do not load real .env credentials', () => {
  it('scripts honor AGENTIC_NO_DOTENV=true and skip loading .env', () => {
    // Every production script in the example repo checks AGENTIC_NO_DOTENV
    // before sourcing .env, so tests can disable .env loading safely.
    const scripts = [
      'setup-direct.sh',
      'run-direct.sh',
      'setup-podman.sh',
      'run-podman.sh',
      'run-local-podman.sh',
      'setup-codeengine.sh',
      'run-codeengine.sh',
      'watch-direct.sh',
      'watch-podman.sh',
      'watch-codeengine.sh',
      'create-pr.sh',
    ];

    for (const scriptName of scripts) {
      const scriptPath = path.join(EXAMPLE_REPO_ROOT, 'scripts', scriptName);
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('AGENTIC_NO_DOTENV');
      expect(content).toMatch(/if \[ "\$\{AGENTIC_NO_DOTENV:-false\}" != "true" \] && \[ -f "\$\{REPO_ROOT\}\/\.env" \]/);
    }
  });

  it('run-direct.sh with AGENTIC_NO_DOTENV=true does not use credentials from .env', () => {
    const envPath = path.join(EXAMPLE_REPO_ROOT, '.env');
    const backupPath = `${envPath}.testbackup`;
    const originalEnvExists = fs.existsSync(envPath);
    if (originalEnvExists) {
      fs.renameSync(envPath, backupPath);
    }

    fs.writeFileSync(
      envPath,
      'HARNESS_AGENT_RUNTIME=kilo\nKILO_API_KEY=real-kilo-secret\nOLLAMA_HOST=http://real-ollama\nGITHUB_TOKEN=ghp_real\nIBMCLOUD_API_KEY=real-ibm\n',
      'utf-8',
    );

    try {
      let stdout = '';
      let stderr = '';
      try {
        stdout = execFileSync('bash', [path.join(EXAMPLE_REPO_ROOT, 'scripts', 'run-direct.sh')], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            AGENTIC_NO_DOTENV: 'true',
            HARNESS_AGENT_RUNTIME: 'mock',
            HARNESS_MAX_ITERATIONS: '0',
            HARNESS_TIME_LIMIT_MINUTES: '0',
          },
        });
      } catch (err) {
        stdout = (err as Error & { stdout?: string }).stdout ?? '';
        stderr = (err as Error & { stderr?: string }).stderr ?? '';
      }

      const combined = stdout + stderr;
      expect(combined).not.toContain('real-kilo-secret');
      expect(combined).not.toContain('real-ollama');
      expect(combined).not.toContain('ghp_real');
      expect(combined).not.toContain('real-ibm');
    } finally {
      fs.rmSync(envPath, { force: true });
      if (originalEnvExists) {
        fs.renameSync(backupPath, envPath);
      }
    }
  });
});

describe('VAL-CRED-005: .env.example runtime and credential coverage', () => {
  for (const repoRoot of [HARNESS_REPO_ROOT, EXAMPLE_REPO_ROOT]) {
    const repoName = describeRepository(repoRoot);

    describe(`${repoName} .env.example`, () => {
      let content: string;

      it('exists and is readable', () => {
        content = readEnvExample(repoRoot);
        expect(content.length).toBeGreaterThan(0);
      });

      it('documents every supported HARNESS_AGENT_RUNTIME value', () => {
        content = readEnvExample(repoRoot);
        expect(content).toMatch(/HARNESS_AGENT_RUNTIME\s*=/);
        for (const runtime of RUNTIMES) {
          expect(content).toContain(runtime);
        }
      });

      it('documents required Ollama credential env vars', () => {
        content = readEnvExample(repoRoot);
        for (const envVar of REQUIRED_OLLAMA_VARS) {
          expect(content).toContain(envVar);
        }
      });

      it('documents required Kilo credential env var', () => {
        content = readEnvExample(repoRoot);
        expect(content).toContain(REQUIRED_KILO_VAR);
      });
    });
  }
});
