import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUICKSTART_PATH = path.resolve(__dirname, '..', '..', '..', 'quickstart.md');

describe('quickstart.md', () => {
  it('exists and is non-empty', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('has a Prerequisites section', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 1\.\s*Prerequisites/);
  });

  it('has a Credentials summary section', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 2\.\s*Credentials summary/);
    expect(content).toContain('OLLAMA_HOST');
    expect(content).toContain('OLLAMA_MODELS');
    expect(content).toContain('OLLAMA_API_KEY');
    expect(content).toContain('GITHUB_TOKEN');
    expect(content).toContain('IBMCLOUD_API_KEY');
  });

  it('has a Quickstart — direct harness execution command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 3\.\s*Quickstart — direct harness execution/);
    expect(content).toContain('setup-direct.sh');
    expect(content).toContain('run-direct.sh');
  });

  it('has a Quickstart — local Podman command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 4\.\s*Quickstart — local Podman/);
    expect(content).toContain('setup-podman.sh');
    expect(content).toContain('run-podman.sh');
  });

  it('has a Quickstart — IBM Cloud Code Engine command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 5\.\s*Quickstart — IBM Cloud Code Engine/);
    expect(content).toContain('setup-codeengine.sh');
    expect(content).toContain('run-codeengine.sh');
  });

  it('has a Watching logs section for each phase', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 6\.\s*Watching logs/);
    expect(content).toContain('watch-direct.sh');
    expect(content).toContain('watch-podman.sh');
    expect(content).toContain('watch-codeengine.sh');
  });

  it('has a Troubleshooting section', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 7\.\s*Troubleshooting/);
  });

  it('warns that credentials must not be committed', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/do not commit secrets|never be committed|Do not commit secrets/i);
  });
});
