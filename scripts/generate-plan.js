#!/usr/bin/env node

/**
 * scripts/generate-plan.js
 *
 * Generate a harness-compatible plan.yaml from a Markdown prompt file and
 * ensure a minimal workspace/rules.yaml exists.
 *
 * Usage:
 *   generate-plan.js <prompt-file> <output-plan.yaml> [output-rules.yaml]
 *
 * The prompt markdown is embedded as the goal.description. The generated
 * plan.yaml is valid YAML and conforms to the harness plan schema:
 *   meta, goal, inputs, outputs, completion_criteria, rules.
 *
 * If output-rules.yaml is provided and the file does not already exist, a
 * minimal rules.yaml is written so the harness does not fail on a missing
 * rules file.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build a harness Plan object from a Markdown prompt.
 *
 * @param {string} promptPath - Absolute path to the source prompt file.
 * @param {string} prompt - Markdown content of the prompt.
 * @returns {object} Plan object matching the harness schema.
 */
function buildPlan(promptPath, prompt) {
  return {
    meta: {
      title: 'FVT Coverage Run',
      version: '1',
      author: 'agentic-harness',
    },
    goal: {
      description: prompt,
      measurable:
        "The example repo's test suite has more passing tests and higher coverage than at the start of the run.",
    },
    inputs: [
      {
        name: 'prompt',
        type: 'file',
        path: path.relative(path.dirname(promptPath), promptPath),
        description: 'Original Markdown prompt used to derive this plan',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'file',
        path: 'result.yaml',
        description: 'Final harness result with status and iterations',
      },
    ],
    completion_criteria: [
      {
        id: 'CC-001',
        description: 'FVT tests were generated or updated',
        test: 'npm test passes with at least as many tests as before',
      },
    ],
    rules: [
      {
        rule_id: 'RULE-001',
        applies: true,
      },
    ],
  };
}

/**
 * Write a minimal default rules.yaml if one does not already exist.
 *
 * @param {string} rulesFile - Absolute path to the rules output file.
 */
async function writeDefaultRules(rulesFile) {
  try {
    await fs.access(rulesFile);
    console.log(`[generate-plan] Rules already exist: ${rulesFile}`);
    return;
  } catch {
    // File does not exist; continue and create it.
  }

  const rules = {
    rules: [
      {
        id: 'RULE-001',
        name: 'Keep tests in sample language',
        description:
          'New FVT tests must use the same language and framework as the sample project.',
        required: true,
        check: 'language matches',
      },
      {
        id: 'RULE-002',
        name: 'Do not modify application source',
        description: 'Prefer adding tests over changing application code.',
        required: true,
        check: 'source diff empty',
      },
    ],
  };

  await fs.mkdir(path.dirname(rulesFile), { recursive: true });
  await fs.writeFile(rulesFile, yaml.dump(rules, { lineWidth: -1, noRefs: true }), 'utf-8');
  console.log(`[generate-plan] Wrote default rules to ${rulesFile}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3) {
    console.error(
      'Usage: generate-plan.js <prompt-file> <output-plan.yaml> [output-rules.yaml]',
    );
    process.exit(1);
  }

  const [promptFile, outputFile, rulesFile] = args;

  const prompt = await fs.readFile(promptFile, 'utf-8');
  const plan = buildPlan(path.resolve(promptFile), prompt);
  const planYaml = yaml.dump(plan, { lineWidth: -1, noRefs: true });

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, planYaml, 'utf-8');

  if (rulesFile) {
    await writeDefaultRules(rulesFile);
  }

  console.log(`[generate-plan] Wrote plan to ${outputFile}`);
}

main().catch((err) => {
  console.error(`[generate-plan] ERROR: ${err.message}`);
  process.exit(1);
});
