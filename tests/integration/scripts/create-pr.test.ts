import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'create-pr.sh');

/**
 * Run a script with the test environment. AGENTIC_NO_DOTENV defaults to true
 * so tests never load the user's real .env credentials.
 */
function runScript(
  args: string[] = [],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [SCRIPT_PATH, ...args], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        AGENTIC_NO_DOTENV: 'true',
        ...env,
      },
    });
  } catch (err) {
    status = (err as Error & { status?: number }).status ?? 1;
    stdout = (err as Error & { stdout?: string }).stdout ?? '';
    stderr = (err as Error & { stderr?: string }).stderr ?? '';
  }
  return { stdout, stderr, status };
}

describe('create-pr script', () => {
  it('has valid bash syntax', () => {
    const output = execFileSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf-8' });
    expect(output).toBe('');
  });

  it('fails when GITHUB_TOKEN is missing', () => {
    const result = runScript(['/tmp'], {
      GITHUB_TOKEN: '',
      GITHUB_REPO: 'owner/repo',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('GITHUB_TOKEN');
  });

  it('resolves repo and branch from git remote when no env vars or plan are set', () => {
    const repoDir = execFileSync('mktemp', ['-d'], { encoding: 'utf-8' }).trim();
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/repo.git'], {
      cwd: repoDir,
    });
    execFileSync('git', ['config', 'user.email', 'test@example.local'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    const workspaceDir = execFileSync('mktemp', ['-d'], { encoding: 'utf-8' }).trim();
    execFileSync('mkdir', ['-p', `${workspaceDir}/inputs/code-engine-samples`]);
    execFileSync('cp', ['-R', `${repoDir}/.`, `${workspaceDir}/inputs/code-engine-samples/`]);

    // The script exits at the "nothing to commit" check before needing a real token.
    const result = runScript([workspaceDir], {
      GITHUB_TOKEN: 'ghp_test',
      GITHUB_REPO: '',
      GITHUB_BASE_BRANCH: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No FVT changes to commit');
  });

  it('resolves repo and branch from the plan metadata when present', () => {
    const repoDir = execFileSync('mktemp', ['-d'], { encoding: 'utf-8' }).trim();
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/repo.git'], {
      cwd: repoDir,
    });

    const workspaceDir = execFileSync('mktemp', ['-d'], { encoding: 'utf-8' }).trim();
    execFileSync('mkdir', ['-p', `${workspaceDir}/inputs/code-engine-samples`]);
    execFileSync('cp', ['-R', `${repoDir}/.`, `${workspaceDir}/inputs/code-engine-samples/`]);
    execFileSync('mkdir', ['-p', `${workspaceDir}/samples/foo`]);
    execFileSync('bash', ['-c', `printf 'meta:\n  github_repo: plan-owner/plan-repo\n  github_base_branch: main\n' > "${workspaceDir}/samples/foo/plan.yaml"`]);

    const result = runScript([workspaceDir], {
      GITHUB_TOKEN: 'ghp_test',
      GITHUB_REPO: '',
      GITHUB_BASE_BRANCH: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No FVT changes to commit');
  });

  it('does not load real credentials from .env during tests', () => {
    const envPath = path.join(path.dirname(SCRIPT_PATH), '..', '.env');
    const backupPath = `${envPath}.testbackup`;
    const originalEnvExists = fsSync.existsSync(envPath);
    if (originalEnvExists) {
      fsSync.renameSync(envPath, backupPath);
    }

    fsSync.writeFileSync(
      envPath,
      'GITHUB_TOKEN=ghp_real_token_from_env\n',
      'utf-8',
    );

    try {
      const result = runScript(['/tmp']);

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('GITHUB_TOKEN');
      expect(result.stderr + result.stdout).not.toContain('ghp_real_token_from_env');
    } finally {
      fsSync.rmSync(envPath, { force: true });
      if (originalEnvExists) {
        fsSync.renameSync(backupPath, envPath);
      }
    }
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
