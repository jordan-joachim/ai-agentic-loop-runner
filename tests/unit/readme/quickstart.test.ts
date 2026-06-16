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

  it('has a Phase 1 quickstart command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 3\.\s*Phase 1 quickstart/);
    expect(content).toContain('setup-phase1.sh');
    expect(content).toContain('run-phase1.sh');
  });

  it('has a Phase 2 quickstart command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 4\.\s*Phase 2 quickstart/);
    expect(content).toContain('setup-phase2.sh');
    expect(content).toContain('run-phase2.sh');
  });

  it('has a Phase 3 quickstart command block', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 5\.\s*Phase 3 quickstart/);
    expect(content).toContain('setup-phase3.sh');
    expect(content).toContain('run-phase3.sh');
  });

  it('has a Watching logs section for each phase', async () => {
    const content = await fs.readFile(QUICKSTART_PATH, 'utf-8');
    expect(content).toMatch(/## 6\.\s*Watching logs/);
    expect(content).toContain('watch-phase1.sh');
    expect(content).toContain('watch-phase2.sh');
    expect(content).toContain('watch-phase3.sh');
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
