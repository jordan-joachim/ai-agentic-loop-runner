import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const README_PATH = path.resolve(__dirname, '..', '..', '..', 'README.md');

describe('README credentials section', () => {
  it('mentions required environment variables', async () => {
    const content = await fs.readFile(README_PATH, 'utf-8');

    expect(content).toContain('Credentials');
    expect(content).toContain('OLLAMA_HOST');
    expect(content).toContain('OLLAMA_MODEL');
    expect(content).toContain('GITHUB_TOKEN');
    expect(content).toContain('GITHUB_REPO');
    expect(content).toContain('IBMCLOUD_API_KEY');
    expect(content).toContain('environment variables');
  });
});
