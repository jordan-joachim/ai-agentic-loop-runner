import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
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
        env: { ...process.env, OLLAMA_HOST: '', OLLAMA_MODEL: 'codellama:7b' },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('OLLAMA_HOST');
  });

  it('fails when OLLAMA_MODEL is missing', () => {
    let error: Error | undefined;
    try {
      execFileSync('bash', [SCRIPT_PATH], {
        encoding: 'utf-8',
        env: { ...process.env, OLLAMA_HOST: 'http://localhost:11434', OLLAMA_MODEL: '' },
      });
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain('OLLAMA_MODEL');
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
    expect(content).toContain('OLLAMA_MODEL');
    expect(content).toContain('DROID_DOER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('DROID_REVIEWER_CONFIG=/workspace/.droids/ollama-droid.md');
    expect(content).toContain('-v');
    expect(content).toContain('podman run');
  });

  it('calls create-pr.sh after the loop when credentials are set', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');

    expect(content).toContain('create-pr.sh');
    expect(content).toContain('GITHUB_TOKEN');
    expect(content).toContain('GITHUB_REPO');
  });
});
