import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'create-pr.sh');

describe('create-pr script', () => {
  it('has valid bash syntax', () => {
    const output = execFileSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf-8' });
    expect(output).toBe('');
  });

  it('fails when GITHUB_TOKEN is missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH, '/tmp'], {
        encoding: 'utf-8',
        env: { ...process.env, GITHUB_TOKEN: '', GITHUB_REPO: 'owner/repo' },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('GITHUB_TOKEN');
  });

  it('fails when GITHUB_REPO is missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH, '/tmp'], {
        encoding: 'utf-8',
        env: { ...process.env, GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: '' },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('GITHUB_REPO');
  });

  it('contains a PR creation command', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('gh pr create');
    expect(content).toContain('https://api.github.com/repos/');
  });

  it('contains git commit and push commands', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('git');
    expect(content).toContain('commit');
    expect(content).toContain('push');
  });

  it('uses a timestamped branch name', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('agentic-loop-fvt-');
    expect(content).toContain('date +%Y%m%d-%H%M%S');
  });
});
