import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DROID_CONFIG_PATH = path.join(REPO_ROOT, '.droids', 'ollama-droid.md');
const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, '.droids', 'ollama.env.example');
const GITIGNORE_PATH = path.join(REPO_ROOT, '.gitignore');

describe('Droid / Ollama configuration', () => {
  it('has the Droid config file', async () => {
    const stats = await fs.stat(DROID_CONFIG_PATH);
    expect(stats.isFile()).toBe(true);
  });

  it('has the Ollama env example file', async () => {
    const stats = await fs.stat(ENV_EXAMPLE_PATH);
    expect(stats.isFile()).toBe(true);
  });

  it('contains only placeholder credentials in the example env file', async () => {
    const content = await fs.readFile(ENV_EXAMPLE_PATH, 'utf-8');

    const forbiddenPatterns = [
      /[a-z0-9_-]*(apikey|api_key|secret|token|password)[a-z0-9_-]*\s*=\s*['"][a-z0-9]{20,}['"]/i,
      /sk-[a-zA-Z0-9]{20,}/,
      /ghp_[a-zA-Z0-9]{20,}/,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(content).not.toMatch(pattern);
    }

    expect(content).toMatch(/OLLAMA_HOST\s*=/);
    expect(content).toMatch(/OLLAMA_MODEL\s*=/);
  });

  it('gitignore blocks the real env file and credential extensions', async () => {
    const gitignore = await fs.readFile(GITIGNORE_PATH, 'utf-8');

    expect(gitignore).toContain('.droids/ollama.env');
    expect(gitignore).toContain('*.key');
    expect(gitignore).toContain('*.token');
  });
});
