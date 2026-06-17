/**
 * Integration test for VAL-CRED-005:
 * Both .env.example files document every supported HARNESS_AGENT_RUNTIME
 * value and the required credential env vars for each runtime.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

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
