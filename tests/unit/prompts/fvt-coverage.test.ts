import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, '..', '..', '..', 'prompts', 'fvt-coverage.md');

async function readPrompt(): Promise<string> {
  return fs.readFile(PROMPT_PATH, 'utf-8');
}

describe('FVT coverage prompt (VAL-EXAMPLE-001)', () => {
  it('exists and is non-empty', async () => {
    const content = await readPrompt();
    expect(content.length).toBeGreaterThan(0);
  });

  // ---- Download instruction ----
  it('instructs the agent to download the IBM CodeEngine samples/ai repo', async () => {
    const content = await readPrompt();
    expect(content).toContain('git clone');
    expect(content).toContain('IBM/CodeEngine');
    expect(content).toContain('inputs/code-engine-samples');
  });

  // ---- DOER section ----
  it('has a clear DOER section with numbered steps', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/DOER Instructions/);
    expect(content).toMatch(/### 1\./);
    expect(content).toMatch(/### 2\./);
    expect(content).toMatch(/### 3\./);
    expect(content).toMatch(/### 4\./);
    expect(content).toMatch(/### 5\./);
    expect(content).toMatch(/### 6\./);
  });

  it('DOER instructions cover sample discovery', async () => {
    const content = await readPrompt();
    expect(content).toContain('samples/ai/');
    expect(content).toContain('package.json');
    expect(content).toContain('requirements.txt');
  });

  it('DOER instructions cover test writing and coverage', async () => {
    const content = await readPrompt();
    expect(content).toContain('coverage.json');
    expect(content).toMatch(/lines.*statements.*functions.*branches/);
  });

  // ---- REVIEWER section ----
  it('has a clear REVIEWER section with numbered steps', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/REVIEWER Instructions/);
    expect(content).toMatch(/### 1\./);
    expect(content).toMatch(/### 2\./);
    expect(content).toMatch(/### 3\./);
    expect(content).toMatch(/### 4\./);
    expect(content).toMatch(/### 5\./);
  });

  it('REVIEWER instructions define done/incomplete decision', async () => {
    const content = await readPrompt();
    expect(content).toContain('done');
    expect(content).toContain('incomplete');
    expect(content).toContain('review.yaml');
  });

  // ---- Measurable coverage goal ----
  it('has a measurable coverage goal', async () => {
    const content = await readPrompt();
    expect(content).toContain('coverage_percent >= 100');
    expect(content).toMatch(/5%|5 percent/);
  });

  // ---- Completion criteria ----
  it('defines completion criteria CC-001 and CC-002', async () => {
    const content = await readPrompt();
    expect(content).toContain('CC-001');
    expect(content).toContain('CC-002');
    expect(content).toContain('coverage_delta_percent <= 5');
  });

  // ---- Output files ----
  it('specifies output files per sample', async () => {
    const content = await readPrompt();
    expect(content).toContain('coverage.json');
    expect(content).toContain('review.yaml');
    expect(content).toContain('result.yaml');
  });

  // ---- Rules ----
  it('includes rules section', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/Rules/);
    expect(content).toContain('Never commit credentials');
    expect(content).toContain('environment variables');
  });

  // ---- Plan YAML structure ----
  it('can serve as plan.yaml content with goal, completion criteria, and rules', async () => {
    const content = await readPrompt();
    // The prompt is designed to be used as plan.yaml content.
    // Verify it contains the structural elements expected in a plan.
    expect(content).toMatch(/Goal/);
    expect(content).toMatch(/Completion Criteria/);
    expect(content).toMatch(/Output Files/);
    expect(content).toMatch(/Rules/);
  });

  // ---- Gaps ----
  it('describes gaps in reviewer output', async () => {
    const content = await readPrompt();
    expect(content).toContain('gaps');
    expect(content).toContain('uncovered');
  });
});
