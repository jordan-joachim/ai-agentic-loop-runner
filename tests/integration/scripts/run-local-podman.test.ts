import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'run-local-podman.sh');

describe('run-local-podman script', () => {
  it('has valid bash syntax', () => {
    const output = execFileSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf-8' });
    expect(output).toBe('');
  });

  it('fails when OLLAMA_HOST is missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          AGENTIC_NO_DOTENV: 'true',
          OLLAMA_HOST: '',
          OLLAMA_MODELS: 'codellama:7b',
          OLLAMA_API_KEY: 'test-key',
        },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('OLLAMA_HOST');
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
      'HARNESS_AGENT_RUNTIME=ollama-droid\nOLLAMA_HOST=http://localhost:11434\nOLLAMA_MODELS=codellama:7b\nOLLAMA_API_KEY=real-secret-from-env\nGITHUB_TOKEN=ghp_real_token\nIBMCLOUD_API_KEY=real-ibm-key\n',
      'utf-8',
    );

    try {
      let error: Error | undefined;
      try {
        execFileSync('bash', [SCRIPT_PATH], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            AGENTIC_NO_DOTENV: 'true',
            OLLAMA_HOST: '',
            OLLAMA_MODELS: 'codellama:7b',
            OLLAMA_API_KEY: 'test-key',
          },
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect((error as Error).message).toContain('OLLAMA_HOST');
      expect((error as Error).message).not.toContain('real-secret-from-env');
      expect((error as Error).message).not.toContain('ghp_real_token');
      expect((error as Error).message).not.toContain('real-ibm-key');
    } finally {
      fsSync.rmSync(envPath, { force: true });
      if (originalEnvExists) {
        fsSync.renameSync(backupPath, envPath);
      }
    }
  });

  it('fails when OLLAMA_MODELS and deprecated OLLAMA_MODEL are both missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          AGENTIC_NO_DOTENV: 'true',
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_MODELS: '',
          OLLAMA_MODEL: '',
          OLLAMA_API_KEY: 'test-key',
        },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/OLLAMA_MODELS|OLLAMA_MODEL/);
  });

  it('accepts the deprecated OLLAMA_MODEL fallback', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH], {
        encoding: 'utf-8',
        timeout: 1000,
        env: {
          ...process.env,
          AGENTIC_NO_DOTENV: 'true',
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_MODELS: '',
          OLLAMA_MODEL: 'codellama:7b',
          OLLAMA_API_KEY: 'test-key',
        },
      });
    } catch (err) {
      error = err as Error;
    }

    // Podman may hang building with an invalid harness dependency. We just
    // verify the script does not fail due to missing model variables.
    if (error) {
      expect((error as Error).message).not.toContain('OLLAMA_MODELS');
      expect((error as Error).message).not.toContain('OLLAMA_MODEL');
    }
  });

  it('fails when OLLAMA_API_KEY is missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          AGENTIC_NO_DOTENV: 'true',
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_MODELS: 'codellama:7b',
          OLLAMA_API_KEY: '',
        },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('OLLAMA_API_KEY');
  });

  it('builds the image with the ollama-droid runtime', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('AGENT_RUNTIME=ollama-droid');
    expect(content).toContain('podman build');
  });

  it('runs the container with required env vars and mounts', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('HARNESS_AGENT_RUNTIME=ollama-droid');
    expect(content).toContain('OLLAMA_HOST');
    expect(content).toContain('OLLAMA_MODELS');
    expect(content).toContain('OLLAMA_API_KEY');
    expect(content).toContain('DROID_DOER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('-v');
    expect(content).toContain('podman run');
    expect(content).toContain('--name agentic-loop-fvt');
    expect(content).toContain('NODE_OPTIONS=--no-warnings');
  });

  it('advertises the live container log command', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('podman logs -f agentic-loop-fvt');
  });

  it('supports an optional FVT_TAIL_LOGS background tail', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('FVT_TAIL_LOGS');
    expect(content).toMatch(/podman logs -f agentic-loop-fvt.*&/);
  });

  it('calls create-pr.sh after the loop when credentials are set', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('create-pr.sh');
    expect(content).toContain('GITHUB_TOKEN');
    expect(content).toContain('GITHUB_REPO');
  });
});
