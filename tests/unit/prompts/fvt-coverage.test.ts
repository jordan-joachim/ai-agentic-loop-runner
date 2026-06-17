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



describe('FVT coverage prompt (VAL-EXAMPLE-001 and VAL-EXAMPLE-005)', () => {
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

  // ---- Phased model instructions ----
  it('instructs the AI to classify steps into setup, execute, and teardown', async () => {
    const content = await readPrompt();
    expect(content).toContain('ONE-TIME SETUP');
    expect(content).toContain('ITERATIVE EXECUTE');
    expect(content).toContain('ONE-TIME TEARDOWN');
    expect(content).toContain('phases.setup');
    expect(content).toContain('phases.execute');
    expect(content).toContain('phases.teardown');
  });

  it('requires setup to capture baseline coverage and write starting-summary.md', async () => {
    const content = await readPrompt();
    expect(content).toContain('setup/starting-summary.md');
    expect(content).toContain('Capture baseline FVT coverage');
    expect(content).toContain('baseline coverage');
  });

  it('requires teardown to compare results to starting-summary.md and explain why the loop finished', async () => {
    const content = await readPrompt();
    expect(content).toContain('teardown/final-summary.md');
    expect(content).toContain('setup/starting-summary.md');
    expect(content).toContain('why the loop finished');
    expect(content).toContain('Compare the final coverage');
  });

  it('requires teardown to push branch, open PR, and write pr-url.txt', async () => {
    const content = await readPrompt();
    expect(content).toContain('push');
    expect(content).toContain('pull request');
    expect(content).toContain('teardown/pr-url.txt');
    expect(content).toContain('GITHUB_TOKEN');
  });

  // ---- DOER section ----
  it('has clear DOER instructions', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/DOER Instructions|DOER agent/);
    expect(content).toContain('coverage.json');
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
  it('has clear REVIEWER instructions', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/REVIEWER Instructions|REVIEWER agent/);
    expect(content).toContain('review.yaml');
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
  it('specifies output files per sample and phase', async () => {
    const content = await readPrompt();
    expect(content).toContain('coverage.json');
    expect(content).toContain('review.yaml');
    expect(content).toContain('starting-summary.md');
    expect(content).toContain('final-summary.md');
    expect(content).toContain('pr-url.txt');
  });

  // ---- Rules ----
  it('includes rules section', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/Rules/);
    expect(content).toContain('Never commit credentials');
    expect(content).toContain('environment variables');
  });

  // ---- Plan YAML structure ----
  it('describes a phased plan.yaml structure with meta, inputs, phases, and rules', async () => {
    const content = await readPrompt();
    expect(content).toMatch(/meta:/);
    expect(content).toMatch(/inputs:/);
    expect(content).toMatch(/phases:/);
    expect(content).toMatch(/phases\.setup/);
    expect(content).toMatch(/phases\.execute/);
    expect(content).toMatch(/phases\.teardown/);
    expect(content).toMatch(/rules:/);
    expect(content).toContain('version: "2"');
  });

  // ---- Legacy YAML plan file ----
  it('keeps the legacy fvt-coverage.yaml plan file for backwards compatibility', async () => {
    const stats = await fs.stat(PLAN_PATH);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  // ---- Gaps ----
  it('describes gaps in reviewer output', async () => {
    const content = await readPrompt();
    expect(content).toContain('gaps');
    expect(content).toContain('uncovered');
  });

  // ---- Extracted plan requirements ----
  it('lists the structural checks required for the extracted plan.yaml', async () => {
    const content = await readPrompt();
    expect(content).toContain('Extracted plan.yaml');
    expect(content).toContain('phases.setup.outputs');
    expect(content).toContain('phases.execute.goal.measurable');
    expect(content).toContain('phases.execute.completion_criteria');
    expect(content).toContain('phases.execute.doer');
    expect(content).toContain('phases.execute.reviewer');
    expect(content).toContain('phases.teardown.outputs');
  });
});

function extractPhasedPlanFromPrompt(content: string): Record<string, unknown> {
  // The prompt embeds several YAML fenced code blocks. We concatenate the
  // `meta`, `inputs`, `phases`, and `rules` blocks so the prompt itself can be
  // interpreted as a valid phased plan.yaml. The prompt contains multiple
  // `phases:` sub-blocks (setup outputs, execute outputs, teardown outputs);
  // we merge them under a single `phases:` root by collecting each block and
  // wrapping the phase sub-blocks when needed.
  const blocks: string[] = [];
  const regex = /^```yaml\n([\s\S]*?)\n```$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const block = match[1] as string;
    if (
      block.startsWith('meta:') ||
      block.startsWith('inputs:') ||
      block.startsWith('phases:') ||
      block.startsWith('rules:')
    ) {
      blocks.push(block);
    }
  }
  if (blocks.length === 0) {
    throw new Error('No phased plan YAML blocks found in prompt');
  }

  // Normalize phase sub-blocks: the prompt contains multiple `phases:` fenced
  // blocks (setup outputs, execute outputs, teardown outputs). Merge them
  // under a single `phases:` root so the combined YAML is valid.
  const phaseSubBlocks: string[] = [];
  const otherBlocks: string[] = [];
  for (const block of blocks) {
    if (block.startsWith('phases:')) {
      const body = block.replace(/^phases:\n?/, '');
      if (
        /^\s+setup:\s*$/m.test(body) ||
        /^\s+execute:\s*$/m.test(body) ||
        /^\s+teardown:\s*$/m.test(body)
      ) {
        phaseSubBlocks.push(body);
      } else {
        otherBlocks.push(block);
      }
    } else if (block.startsWith('meta:')) {
      // Prefer the first meta block (the one with the title and version).
      const existingMeta = otherBlocks.find((b) => b.startsWith('meta:'));
      if (!existingMeta) {
        otherBlocks.push(block);
      }
    } else {
      otherBlocks.push(block);
    }
  }

  let combined: string;
  if (phaseSubBlocks.length > 0) {
    // Re-indent each phase sub-block by two spaces so it nests under phases:.
    const mergedPhases = 'phases:\n' + phaseSubBlocks.map((b) => b.replace(/^/gm, '  ')).join('\n');
    combined = [...otherBlocks, mergedPhases].join('\n');
  } else {
    combined = otherBlocks.join('\n');
  }

  const parsed = yaml.load(combined);
  if (parsed === undefined || parsed === null) {
    throw new Error('Combined YAML blocks parsed to nothing');
  }
  return parsed as Record<string, unknown>;
}

describe('FVT coverage YAML plan (VAL-EXAMPLE-005)', () => {
  it('the prompt can be combined into a valid phased plan.yaml', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    expect(plan).toMatchObject({
      meta: expect.any(Object),
      inputs: expect.any(Array),
      phases: expect.any(Object),
      rules: expect.any(Array),
    });
  });

  it('phased plan has meta title, version "2", and author', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const meta = plan.meta as Record<string, unknown>;
    expect(meta.title).toEqual(expect.any(String));
    expect(meta.version).toBe('2');
    expect(meta.author).toEqual(expect.any(String));
  });

  it('phased plan has at least one inputs entry with required fields', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    expect(Array.isArray(plan.inputs)).toBe(true);
    const inputs = plan.inputs as Record<string, unknown>[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
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

  it('phased plan has setup phase with clone, install, and baseline coverage', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const setup = (plan.phases as Record<string, unknown>).setup as Record<string, unknown>;
    expect(typeof setup.description).toBe('string');
    const setupDescription = setup.description as string;
    expect(setupDescription).toContain('git clone');
    expect(setupDescription).toContain('install');
    expect(setupDescription).toContain('baseline');
    expect(setupDescription).toContain('coverage');
  });

  it('phased plan setup outputs include setup/starting-summary.md', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const setup = (plan.phases as Record<string, unknown>).setup as Record<string, unknown>;
    const outputs = setup.outputs as Record<string, unknown>[];
    expect(outputs.some((o) => String(o.path).endsWith('setup/starting-summary.md'))).toBe(true);
  });

  it('phased plan execute phase has goal.measurable, completion_criteria, doer, reviewer, and outputs', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const execute = (plan.phases as Record<string, unknown>).execute as Record<string, unknown>;
    expect((execute.goal as Record<string, unknown>).measurable).toEqual(expect.any(String));
    expect(String((execute.goal as Record<string, unknown>).measurable).length).toBeGreaterThan(0);
    expect(Array.isArray(execute.completion_criteria)).toBe(true);
    expect((execute.completion_criteria as Record<string, unknown>[]).length).toBeGreaterThan(0);
    expect(typeof execute.doer).toBe('string');
    expect(String(execute.doer).length).toBeGreaterThan(0);
    expect(typeof execute.reviewer).toBe('string');
    expect(String(execute.reviewer).length).toBeGreaterThan(0);
    expect(Array.isArray(execute.outputs)).toBe(true);
    expect((execute.outputs as Record<string, unknown>[]).length).toBeGreaterThan(0);
  });

  it('phased plan teardown description includes push, PR, and final summary', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const teardown = (plan.phases as Record<string, unknown>).teardown as Record<string, unknown>;
    const teardownDescription = teardown.description as string;
    expect(teardownDescription.toLowerCase()).toContain('push');
    expect(teardownDescription.toLowerCase()).toContain('pull request');
    expect(teardownDescription).toContain('teardown/final-summary.md');
    expect(teardownDescription).toContain('setup/starting-summary.md');
    expect(teardownDescription).toContain('why the loop finished');
  });

  it('phased plan teardown outputs include teardown/final-summary.md and teardown/pr-url.txt', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const teardown = (plan.phases as Record<string, unknown>).teardown as Record<string, unknown>;
    const outputs = teardown.outputs as Record<string, unknown>[];
    expect(outputs.some((o) => String(o.path).endsWith('teardown/final-summary.md'))).toBe(true);
    expect(outputs.some((o) => String(o.path).endsWith('teardown/pr-url.txt'))).toBe(true);
  });

  it('phased plan completion criteria include CC-001 and CC-002', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const execute = (plan.phases as Record<string, unknown>).execute as Record<string, unknown>;
    const criteria = execute.completion_criteria as Record<string, unknown>[];
    const ids = criteria.map((c) => c.id);
    expect(ids).toContain('CC-001');
    expect(ids).toContain('CC-002');
  });

  it('phased plan references at least one applicable rule', async () => {
    const content = await readPrompt();
    const plan = extractPhasedPlanFromPrompt(content);
    const rules = plan.rules as Record<string, unknown>[];
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => typeof r.rule_id === 'string' && typeof r.applies === 'boolean')).toBe(true);
  });
});
