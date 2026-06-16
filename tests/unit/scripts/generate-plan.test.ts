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
      title: 'FVT Coverage Run',
      version: '1',
      author: 'agentic-harness',
    });

    expect(parsed.goal).toMatchObject({
      measurable:
        "The example repo's test suite has more passing tests and higher coverage than at the start of the run.",
    });
    expect(typeof (parsed.goal as Record<string, unknown>).description).toBe('string');
    expect((parsed.goal as Record<string, unknown>).description).toContain('FVT Coverage Plan');

    expect(Array.isArray(parsed.inputs)).toBe(true);
    expect(parsed.inputs).toHaveLength(1);
    expect((parsed.inputs as Record<string, unknown>[])[0]).toMatchObject({
      name: 'prompt',
      type: 'file',
      description: 'Original Markdown prompt used to derive this plan',
    });

    expect(Array.isArray(parsed.outputs)).toBe(true);
    expect((parsed.outputs as Record<string, unknown>[])[0]).toMatchObject({
      name: 'result',
      type: 'file',
      path: 'result.yaml',
    });

    expect(Array.isArray(parsed.completion_criteria)).toBe(true);
    expect((parsed.completion_criteria as Record<string, unknown>[])[0]).toMatchObject({
      id: 'CC-001',
      description: 'FVT tests were generated or updated',
      test: 'npm test passes with at least as many tests as before',
    });

    expect(Array.isArray(parsed.rules)).toBe(true);
    expect((parsed.rules as Record<string, unknown>[])[0]).toMatchObject({
      rule_id: 'RULE-001',
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
    const description = (parsed.goal as Record<string, unknown>).description as string;
    expect(description).toContain('line1');
    expect(description).toContain('"quoted"');
  });
});
