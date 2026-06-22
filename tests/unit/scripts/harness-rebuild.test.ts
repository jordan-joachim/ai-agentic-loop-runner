import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SETUP_DIRECT = path.join(SCRIPT_DIR, 'setup-direct.sh');
const SETUP_PODMAN = path.join(SCRIPT_DIR, 'setup-podman.sh');
const SETUP_CODEENGINE = path.join(SCRIPT_DIR, 'setup-codeengine.sh');
const HARNESS_PACKAGE_PATH = path.join(
  REPO_ROOT,
  'node_modules',
  '@ai-agentic-loop',
  'harness',
);

function runScript(
  scriptPath: string,
  args: string[] = [],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [scriptPath, ...args], {
      encoding: 'utf-8',
      // Always default to AGENTIC_NO_DOTENV=true so tests cannot accidentally
      // load the user's .env file. Callers may override by passing the
      // variable explicitly.
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

describe('harness rebuild detection', () => {
  describe('script content', () => {
    const scripts = [
      { name: 'setup-direct.sh', path: SETUP_DIRECT },
      { name: 'setup-podman.sh', path: SETUP_PODMAN },
      { name: 'setup-codeengine.sh', path: SETUP_CODEENGINE },
    ];

    for (const { name, path: scriptPath } of scripts) {
      it(`${name} contains symlink detection logic`, () => {
        const content = fsSync.readFileSync(scriptPath, 'utf-8');
        expect(content).toContain('node_modules/@ai-agentic-loop/harness');
        expect(content).toContain('readlink -f');
        expect(content).toContain('npm run build');
        expect(content).toContain('Detected linked harness package');
        expect(content).toContain('skipping build');
      });

      it(`${name} uses -L test for symlink check`, () => {
        const content = fsSync.readFileSync(scriptPath, 'utf-8');
        expect(content).toMatch(/if \[ -L/);
      });
    }
  });

  describe('when harness package is a symlink', () => {
    it('setup-direct.sh builds the linked harness', () => {
      // The harness package is already a symlink in the dev environment.
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(true);

      const result = runScript(SETUP_DIRECT, [], {
        AGENTIC_NO_DOTENV: 'true',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Detected linked harness package');
      expect(result.stdout).toContain('Harness package build complete');
    });

    it('setup-podman.sh builds the linked harness', () => {
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(true);

      const result = runScript(SETUP_PODMAN, [], {
        AGENTIC_NO_DOTENV: 'true',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Detected linked harness package');
      expect(result.stdout).toContain('Harness package build complete');
    });

    it('setup-codeengine.sh builds the linked harness', () => {
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(true);

      // setup-codeengine.sh requires IBMCLOUD_API_KEY, but the harness build
      // happens before credential validation. We provide a fake key so the
      // script doesn't fail on credential check (it will fail later on
      // ibmcloud commands, but we only care about the build step output).
      const result = runScript(SETUP_CODEENGINE, [], {
        AGENTIC_NO_DOTENV: 'true',
        IBMCLOUD_API_KEY: 'fake-key-for-test',
      });
      // The script may fail later (ibmcloud commands), but the build step
      // should have emitted its log messages.
      expect(result.stdout).toContain('Detected linked harness package');
      expect(result.stdout).toContain('Harness package build complete');
    });
  });

  describe('when harness package is not a symlink', () => {
    let originalStat: fsSync.Stats | null = null;
    let backupPath: string | null = null;

    beforeAll(() => {
      // Save the original symlink state.
      originalStat = fsSync.lstatSync(HARNESS_PACKAGE_PATH);
      if (originalStat.isSymbolicLink()) {
        // Move the symlink aside and create a real directory in its place.
        backupPath = HARNESS_PACKAGE_PATH + '.testbackup';
        fsSync.renameSync(HARNESS_PACKAGE_PATH, backupPath);
        fsSync.mkdirSync(HARNESS_PACKAGE_PATH, { recursive: true });
        // Create a minimal package.json so npm doesn't complain.
        fsSync.writeFileSync(
          path.join(HARNESS_PACKAGE_PATH, 'package.json'),
          JSON.stringify({ name: '@ai-agentic-loop/harness', version: '0.1.0' }),
          'utf-8',
        );
      }
    });

    afterAll(() => {
      // Restore the original symlink.
      if (backupPath && fsSync.existsSync(backupPath)) {
        fsSync.rmSync(HARNESS_PACKAGE_PATH, { recursive: true, force: true });
        fsSync.renameSync(backupPath, HARNESS_PACKAGE_PATH);
      }
    });

    it('setup-direct.sh skips the build', () => {
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(false);

      const result = runScript(SETUP_DIRECT, [], {
        AGENTIC_NO_DOTENV: 'true',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('skipping build');
      expect(result.stdout).not.toContain('Detected linked harness package');
    });

    it('setup-podman.sh skips the build', () => {
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(false);

      const result = runScript(SETUP_PODMAN, [], {
        AGENTIC_NO_DOTENV: 'true',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('skipping build');
      expect(result.stdout).not.toContain('Detected linked harness package');
    });

    it('setup-codeengine.sh skips the build', () => {
      expect(fsSync.lstatSync(HARNESS_PACKAGE_PATH).isSymbolicLink()).toBe(false);

      const result = runScript(SETUP_CODEENGINE, [], {
        AGENTIC_NO_DOTENV: 'true',
        IBMCLOUD_API_KEY: 'fake-key-for-test',
      });
      expect(result.stdout).toContain('skipping build');
      expect(result.stdout).not.toContain('Detected linked harness package');
    });
  });
});
