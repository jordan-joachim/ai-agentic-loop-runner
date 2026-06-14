import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, '..', '..', '..', 'prompts', 'fvt-coverage.md');

describe('FVT coverage prompt', () => {
  it('exists and contains required instructions', async () => {
    const content = await fs.readFile(PROMPT_PATH, 'utf-8');

    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('inputs/code-engine-samples/');
    expect(content).toContain('samples/ai/');
    expect(content).toContain('package.json');
    expect(content).toContain('requirements.txt');
    expect(content).toContain('coverage.json');
    expect(content).toContain('100%');
    expect(content).toMatch(/5%|5 percent/);
    expect(content).toContain('gaps');
  });
});
