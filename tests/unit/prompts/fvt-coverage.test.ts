import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, '..', '..', '..', 'prompts', 'fvt-coverage.md');
const PLAN_PATH = path.resolve(__dirname, '..', '..', '..', 'prompts', 'fvt-coverage.yaml');

async function readPrompt(): Promise<string> {
  return fs.readFile(PROMPT_PATH, 'utf-8');
}

async function readPlan(): Promise<Record<string, unknown>> {
  const content = await fs.readFile(PLAN_PATH, 'utf-8');
  const parsed = yaml.load(content);
  if (parsed === undefined || parsed === null) {
    throw new Error('fvt-coverage.yaml is empty or contains no YAML document');
  }
  return parsed as Record<string, unknown>;
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

describe('FVT coverage YAML plan (VAL-EXAMPLE-002)', () => {
  it('exists and is non-empty', async () => {
    const stats = await fs.stat(PLAN_PATH);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it('parses as valid YAML', async () => {
    const plan = await readPlan();
    expect(typeof plan).toBe('object');
  });

  it('has required meta fields', async () => {
    const plan = await readPlan();
    expect(plan.meta).toMatchObject({
      title: expect.any(String),
      version: expect.any(String),
      author: expect.any(String),
    });
  });

  it('has a goal with description and measurable fields', async () => {
    const plan = await readPlan();
    expect(plan.goal).toMatchObject({
      description: expect.any(String),
      measurable: expect.any(String),
    });
    expect(String((plan.goal as Record<string, unknown>).description).length).toBeGreaterThan(0);
    expect(String((plan.goal as Record<string, unknown>).measurable).length).toBeGreaterThan(0);
  });

  it('has at least one inputs entry with required fields', async () => {
    const plan = await readPlan();
    expect(Array.isArray(plan.inputs)).toBe(true);
    expect((plan.inputs as Record<string, unknown>[]).length).toBeGreaterThan(0);
    for (const input of plan.inputs as Record<string, unknown>[]) {
      expect(input).toMatchObject({
        name: expect.any(String),
        type: expect.any(String),
        description: expect.any(String),
      });
      if ((input.type as string) !== 'string') {
        expect(input).toHaveProperty('path');
        expect(typeof input.path).toBe('string');
      }
    }
  });

  it('has at least one outputs entry with required fields', async () => {
    const plan = await readPlan();
    expect(Array.isArray(plan.outputs)).toBe(true);
    expect((plan.outputs as Record<string, unknown>[]).length).toBeGreaterThan(0);
    for (const output of plan.outputs as Record<string, unknown>[]) {
      expect(output).toMatchObject({
        name: expect.any(String),
        type: expect.any(String),
        path: expect.any(String),
        description: expect.any(String),
      });
    }
  });

  it('has completion criteria matching CC-001 and CC-002', async () => {
    const plan = await readPlan();
    expect(Array.isArray(plan.completion_criteria)).toBe(true);
    const criteria = plan.completion_criteria as Record<string, unknown>[];
    expect(criteria).toHaveLength(3);
    expect(criteria[0]).toMatchObject({
      id: 'CC-001',
      description: 'Coverage reaches 100%',
      test: 'coverage_percent >= 100',
    });
    expect(criteria[1]).toMatchObject({
      id: 'CC-002',
      description: 'Coverage improvement stalls',
      test: 'coverage_delta_percent <= 5',
    });
  });

  it('has rules referencing applicable rule IDs', async () => {
    const plan = await readPlan();
    expect(Array.isArray(plan.rules)).toBe(true);
    const rules = plan.rules as Record<string, unknown>[];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toHaveProperty('rule_id');
      expect(rule).toHaveProperty('applies');
      expect(typeof rule.rule_id).toBe('string');
      expect(typeof rule.applies).toBe('boolean');
    }
  });

  it('embeds the key FVT coverage instructions in the goal', async () => {
    const plan = await readPlan();
    const description = String((plan.goal as Record<string, unknown>).description);
    expect(description).toContain('IBM CodeEngine');
    expect(description).toContain('samples/ai');
    expect(description).toContain('coverage');
  });
});
