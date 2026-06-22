import { describe, it, expect } from 'vitest';

describe('ai-agentic-loop-runner', () => {
  it('has a valid package.json with harness dependency', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.name).toBe('@ai-agentic-loop/runner');
    expect(pkg.default.dependencies).toBeDefined();
    expect(pkg.default.dependencies['@ai-agentic-loop/harness']).toBeDefined();
  });

  it('has required npm scripts', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.scripts.build).toBeDefined();
    expect(pkg.default.scripts.typecheck).toBeDefined();
    expect(pkg.default.scripts.test).toBeDefined();
    expect(pkg.default.scripts.lint).toBeDefined();
  });

  it('has required devDependencies', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.devDependencies.typescript).toBeDefined();
    expect(pkg.default.devDependencies.vitest).toBeDefined();
    expect(pkg.default.devDependencies.eslint).toBeDefined();
    expect(pkg.default.devDependencies.prettier).toBeDefined();
  });
});
