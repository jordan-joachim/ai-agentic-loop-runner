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
const PROMPT_PATH = path.join(REPO_ROOT, 'prompts', 'fvt-coverage.md');
const GENERATE_PLAN_SCRIPT = path.join(SCRIPT_DIR, 'generate-plan.js');

describe('generate-plan.js', () => {
  it('exists', () => {
    expect(fsSync.existsSync(GENERATE_PLAN_SCRIPT)).toBe(true);
  });

  it('generates a valid harness plan.yaml from the default prompt', async () => {
    const outputDir = path.join(REPO_ROOT, 'tests', 'output', 'generate-plan');
    const planPath = path.join(outputDir, 'plan.yaml');
    await fs.mkdir(outputDir, { recursive: true });

    const result = execFileSync(
      'node',
      ['--no-warnings', GENERATE_PLAN_SCRIPT, PROMPT_PATH, planPath],
      { encoding: 'utf-8' },
    );
    expect(result).toContain('Wrote plan to');

    const content = await fs.readFile(planPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    expect(parsed.meta).toMatchObject({
      title: 'IBM CodeEngine samples/ai FVT coverage run',
      version: '2',
      author: 'agentic-harness',
    });

    expect(parsed.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'code_engine_samples',
          type: 'url',
          path: 'https://github.com/IBM/CodeEngine.git',
        }),
      ]),
    );

    expect(parsed.phases).toMatchObject({
      setup: expect.objectContaining({
        description: expect.any(String),
        outputs: expect.arrayContaining([
          expect.objectContaining({ path: 'setup/starting-summary.md' }),
        ]),
      }),
      execute: expect.objectContaining({
        goal: expect.objectContaining({ measurable: expect.any(String) }),
        completion_criteria: expect.arrayContaining([
          expect.objectContaining({ id: 'CC-001' }),
          expect.objectContaining({ id: 'CC-002' }),
        ]),
        doer: expect.any(String),
        reviewer: expect.any(String),
        outputs: expect.any(Array),
      }),
      teardown: expect.objectContaining({
        description: expect.any(String),
        outputs: expect.arrayContaining([
          expect.objectContaining({ path: 'teardown/final-summary.md' }),
          expect.objectContaining({ path: 'teardown/pr-url.txt' }),
        ]),
      }),
    });

    expect(Array.isArray(parsed.rules)).toBe(true);
    expect(parsed.rules).toHaveLength(2);
    expect((parsed.rules as Record<string, unknown>[])[0]).toMatchObject({
      rule_id: 'RULE-001',
      applies: true,
    });
    expect((parsed.rules as Record<string, unknown>[])[1]).toMatchObject({
      rule_id: 'RULE-002',
      applies: true,
    });
  });

  it('escapes multiline markdown safely in YAML', async () => {
    const outputDir = path.join(REPO_ROOT, 'tests', 'output', 'generate-plan');
    const planPath = path.join(outputDir, 'escaped.yaml');
    await fs.mkdir(outputDir, { recursive: true });

    const tmpPrompt = path.join(outputDir, 'tmp-prompt.md');
    await fs.writeFile(tmpPrompt, '# Title\n\nline1\n  line2\n"quoted"\n', 'utf-8');

    execFileSync('node', ['--no-warnings', GENERATE_PLAN_SCRIPT, tmpPrompt, planPath], {
      encoding: 'utf-8',
    });

    const content = await fs.readFile(planPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;
    // The prompt has no phased blocks, so it falls back to legacy embedding.
    const description = (parsed.goal as Record<string, unknown>).description as string;
    expect(description).toContain('line1');
    expect(description).toContain('"quoted"');
  });

  it('writes a default rules.yaml when a rules output path is provided', async () => {
    const outputDir = path.join(REPO_ROOT, 'tests', 'output', 'generate-plan');
    const planPath = path.join(outputDir, 'with-rules-plan.yaml');
    const rulesPath = path.join(outputDir, 'with-rules.yaml');
    await fs.mkdir(outputDir, { recursive: true });
    try {
      await fs.rm(rulesPath, { force: true });
    } catch {
      // ignore
    }

    const result = execFileSync(
      'node',
      ['--no-warnings', GENERATE_PLAN_SCRIPT, PROMPT_PATH, planPath, rulesPath],
      { encoding: 'utf-8' },
    );
    expect(result).toContain('Wrote default rules');

    const rulesContent = await fs.readFile(rulesPath, 'utf-8');
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

    const planContent = await fs.readFile(planPath, 'utf-8');
    const parsedPlan = yaml.load(planContent) as Record<string, unknown>;
    expect(Array.isArray(parsedPlan.rules)).toBe(true);
    const planRuleIds = (parsedPlan.rules as Record<string, unknown>[]).map(
      (r) => r.rule_id as string,
    );
    const ruleIds = (parsedRules.rules as Record<string, unknown>[]).map(
      (r) => r.id as string,
    );
    expect(planRuleIds).toEqual(ruleIds);
    expect(planRuleIds).toContain('RULE-001');
    expect(planRuleIds).toContain('RULE-002');
  });

  it('does not overwrite an existing rules.yaml', async () => {
    const outputDir = path.join(REPO_ROOT, 'tests', 'output', 'generate-plan');
    const planPath = path.join(outputDir, 'existing-rules-plan.yaml');
    const rulesPath = path.join(outputDir, 'existing-rules.yaml');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(rulesPath, 'rules:\n  - id: CUSTOM\n', 'utf-8');

    const result = execFileSync(
      'node',
      ['--no-warnings', GENERATE_PLAN_SCRIPT, PROMPT_PATH, planPath, rulesPath],
      { encoding: 'utf-8' },
    );
    expect(result).toContain('Rules already exist');

    const content = await fs.readFile(rulesPath, 'utf-8');
    expect(content).toContain('CUSTOM');
    expect(content).not.toContain('RULE-001');
  });
});
